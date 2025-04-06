const { logger } = require('../../utils/logger');

/**
 * Enhanced click handler with improved fallback mechanisms
 * @param {Object} step - The step to execute
 * @param {Object} context - The execution context containing browserAutomation instance
 * @returns {Object} The updated step object
 */
async function handleClick(step, context) {
    const { browserAutomation } = context;

    if (!step.sessionId) {
        throw new Error('Session ID required for click action');
    }
    
    // Use selector from previous findSelector step if available
    if (!step.params.selector && step.selector) {
        step.params.selector = step.selector;
    }
    
    if (!step.params.selector) {
        throw new Error('No selector provided for click action');
    }

    logger.info(`Attempting to click with selector: ${step.params.selector}`);

    try {
        // Get the DOM node for the element
        const documentResult = await browserAutomation.sendCommand('DOM.getDocument', {
            depth: 1
        }, step.sessionId);
        
        const rootNodeId = documentResult.result.root.nodeId;
        let nodeId = null;
        let selectorFound = false;
        
        // Try the provided selector first
        try {
            const queryResult = await browserAutomation.sendCommand('DOM.querySelector', {
                nodeId: rootNodeId,
                selector: step.params.selector
            }, step.sessionId);
            
            if (queryResult.result.nodeId) {
                nodeId = queryResult.result.nodeId;
                selectorFound = true;
                logger.info(`Element found with provided selector: ${step.params.selector}`);
            }
        } catch (error) {
            logger.warn(`Error using primary selector: ${error.message}`);
        }
        
        // If primary selector failed, try alternative selectors
        if (!selectorFound) {
            logger.warn('Element not found with primary selector, trying alternatives');
            
            const alternativeSelectors = [
                // E-commerce product items
                'div._75nlfW a.CGtC98',
                "ytd-item-section-renderer > div > yt-lockup-view-model:nth-child(1) a.yt-lockup-view-model-wiz__content-image",
                'div[data-id] a[href*="product"]',
                'div.product-item a',
                // YouTube video thumbnail
                'ytd-rich-item-renderer a#video-title',
                'ytd-rich-grid-media a#video-title',
                'ytd-grid-video-renderer a#video-title',
                // Common link patterns
                'a.item-title',
                'a.product-title',
                'a.result-title',
                // Generic link with text
                'a:not(:empty)',
                // Generic clickable element
                'button:not([disabled]), input[type="button"]:not([disabled]), input[type="submit"]:not([disabled])',
                // First visible link
                'a[href]:visible'
            ];

            for (const selector of alternativeSelectors) {
                try {
                    const altQueryResult = await browserAutomation.sendCommand('DOM.querySelector', {
                        nodeId: rootNodeId,
                        selector: selector
                    }, step.sessionId);

                    if (altQueryResult.result.nodeId) {
                        logger.info(`Found element using alternative selector: ${selector}`);
                        nodeId = altQueryResult.result.nodeId;
                        step.params.selector = selector;
                        selectorFound = true;
                        break;
                    }
                } catch (error) {
                    // Continue trying other selectors
                }
            }
        }

        // If no selector worked, try to find the first item in search results
        if (!selectorFound) {
            logger.warn('No selectors worked, attempting to find first clickable item');
            
            const findFirstClickable = await browserAutomation.sendCommand('Runtime.evaluate', {
                expression: `
                    (() => {
                        // Find all visible links
                        const links = Array.from(document.querySelectorAll('a[href]'))
                            .filter(el => {
                                const rect = el.getBoundingClientRect();
                                const style = window.getComputedStyle(el);
                                return rect.width > 0 && 
                                       rect.height > 0 && 
                                       style.display !== 'none' && 
                                       style.visibility !== 'hidden' && 
                                       style.opacity !== '0';
                            });
                            
                        // Find product items
                        const productItems = links.filter(link => {
                            const href = link.href.toLowerCase();
                            const text = link.textContent.toLowerCase();
                            return (href.includes('product') || 
                                   href.includes('item') || 
                                   text.includes('laptop') || 
                                   text.includes('phone') ||
                                   link.querySelector('img'));
                        });
                        
                        const targetElement = productItems.length > 0 ? productItems[0] : (links.length > 0 ? links[0] : null);
                        
                        if (targetElement) {
                            // Create an attribute to identify this element
                            targetElement.setAttribute('data-auto-click-target', 'true');
                            return {
                                found: true,
                                selector: '[data-auto-click-target="true"]',
                                rect: targetElement.getBoundingClientRect(),
                                tagName: targetElement.tagName
                            };
                        }
                        
                        return { found: false };
                    })()
                `,
                returnByValue: true
            }, step.sessionId);
            
            if (findFirstClickable.result.result.found) {
                logger.info(`Found clickable element: ${JSON.stringify(findFirstClickable.result.result)}`);
                step.params.selector = findFirstClickable.result.result.selector;
                
                // Get the node ID for our new selector
                const queryResult = await browserAutomation.sendCommand('DOM.querySelector', {
                    nodeId: rootNodeId,
                    selector: step.params.selector
                }, step.sessionId);
                
                if (queryResult.result.nodeId) {
                    nodeId = queryResult.result.nodeId;
                    selectorFound = true;
                }
            }
        }

        if (!selectorFound || !nodeId) {
            // If we can't find the element by selector, try direct coordinates
            logger.warn('Unable to find element with any selector, falling back to coordinate click');
            
            // Get page dimensions
            const layoutMetrics = await browserAutomation.sendCommand('Page.getLayoutMetrics', {}, step.sessionId);
            const viewportWidth = layoutMetrics.result.layoutViewport.clientWidth;
            const viewportHeight = layoutMetrics.result.layoutViewport.clientHeight;
            
            // If this is a search results page, click in the area where first result would be
            const centerX = viewportWidth * 0.5;  // Middle of page
            const centerY = viewportHeight * 0.25; // Upper quarter of page where first result often is
            
            logger.info(`Falling back to coordinate click at (${centerX}, ${centerY})`);
            
            await browserAutomation.sendCommand('Input.dispatchMouseEvent', {
                type: 'mousePressed',
                x: centerX,
                y: centerY,
                button: 'left',
                clickCount: 1
            }, step.sessionId);

            await new Promise(resolve => setTimeout(resolve, 50));

            await browserAutomation.sendCommand('Input.dispatchMouseEvent', {
                type: 'mouseReleased',
                x: centerX,
                y: centerY,
                button: 'left',
                clickCount: 1
            }, step.sessionId);
            
            logger.info(`Clicked at coordinates: (${centerX}, ${centerY})`);
            return step;
        }

        // Element found, now ensure it's visible and scroll to it
        try {
            // Scroll element into view
            await browserAutomation.sendCommand('Runtime.evaluate', {
                expression: `
                    (() => {
                        const element = document.querySelector("${step.params.selector}");
                        if (!element) return false;
                        
                        // Smooth scroll to element
                        element.scrollIntoView({behavior: 'smooth', block: 'center'});
                        return true;
                    })()
                `,
                returnByValue: true
            }, step.sessionId);

            // Wait for scrolling to complete
            await new Promise(resolve => setTimeout(resolve, 700));
        } catch (error) {
            logger.warn(`Error scrolling to element: ${error.message}`);
        }

        // Get element dimension information
        let boxModel;
        try {
            boxModel = await browserAutomation.sendCommand('DOM.getBoxModel', {
                nodeId: nodeId
            }, step.sessionId);
            
            if (!boxModel.result || !boxModel.result.model) {
                throw new Error('Could not get element dimensions');
            }
        } catch (error) {
            logger.warn(`Error getting box model: ${error.message}`);
            boxModel = null;
        }

        // Check if element is visible
        const visibilityCheck = await browserAutomation.sendCommand('Runtime.evaluate', {
            expression: `
                (() => {
                    const element = document.querySelector("${step.params.selector}");
                    if (!element) return { visible: false, reason: "Element not found" };
                    
                    // Check if element is visible
                    const rect = element.getBoundingClientRect();
                    const style = window.getComputedStyle(element);
                    
                    const isVisible = !(
                        rect.width === 0 || 
                        rect.height === 0 || 
                        style.display === 'none' || 
                        style.visibility === 'hidden' || 
                        style.opacity === '0'
                    );
                    
                    return { 
                        visible: isVisible,
                        rect: {
                            top: rect.top,
                            left: rect.left,
                            width: rect.width,
                            height: rect.height
                        }
                    };
                })()
            `,
            returnByValue: true
        }, step.sessionId);

        logger.info(`Element visibility check: ${JSON.stringify(visibilityCheck.result.result)}`);

        // Try different click methods in order of reliability
        const clickMethods = [
            // Method 1: JavaScript click (most reliable)
            async () => {
                const result = await browserAutomation.sendCommand('Runtime.evaluate', {
                    expression: `
                        (() => {
                            const element = document.querySelector("${step.params.selector}");
                            if (!element) return false;
                            
                            try {
                                // Ensure visibility
                                element.style.pointerEvents = "auto";
                                
                                // Standard click
                                element.click();
                                console.log("JavaScript click executed");
                                
                                return true;
                            } catch (e) {
                                console.error("JavaScript click error:", e);
                                return false;
                            }
                        })()
                    `,
                    returnByValue: true
                }, step.sessionId);

                return result.result.value;
            },

            // Method 2: Use DOM focus and mouse events
            async () => {
                if (!boxModel || !boxModel.result || !boxModel.result.model) {
                    return false;
                }

                try {
                    await browserAutomation.sendCommand('DOM.focus', {
                        nodeId: nodeId
                    }, step.sessionId);

                    const { content } = boxModel.result.model;
                    const centerX = (content[0] + content[2] + content[4] + content[6]) / 4;
                    const centerY = (content[1] + content[3] + content[5] + content[7]) / 4;

                    await browserAutomation.sendCommand('Input.dispatchMouseEvent', {
                        type: 'mousePressed',
                        x: centerX,
                        y: centerY,
                        button: 'left',
                        clickCount: 1
                    }, step.sessionId);

                    await new Promise(resolve => setTimeout(resolve, 50));

                    await browserAutomation.sendCommand('Input.dispatchMouseEvent', {
                        type: 'mouseReleased',
                        x: centerX,
                        y: centerY,
                        button: 'left',
                        clickCount: 1
                    }, step.sessionId);

                    logger.info(`Clicked element at coordinates: (${centerX}, ${centerY})`);
                    return true;
                } catch (error) {
                    logger.warn(`Coordinate click error: ${error.message}`);
                    return false;
                }
            },

            // Method 3: Try to click child links or redirect
            async () => {
                const result = await browserAutomation.sendCommand('Runtime.evaluate', {
                    expression: `
                        (() => {
                            const element = document.querySelector("${step.params.selector}");
                            if (!element) return false;
                            
                            // Try to find and click links inside
                            const clickables = element.querySelectorAll('a, button, input[type="submit"], input[type="button"]');
                            if (clickables.length > 0) {
                                console.log("Found " + clickables.length + " clickable elements inside");
                                clickables[0].click();
                                return true;
                            }
                            
                            // If the element is a link, try to navigate directly
                            if (element.tagName === 'A' && element.href) {
                                console.log("Element is a link, navigating to: " + element.href);
                                window.location.href = element.href;
                                return true;
                            }
                            
                            return false;
                        })()
                    `,
                    returnByValue: true
                }, step.sessionId);

                return result.result.value;
            },
            
            // Method 4: Last resort - try direct URL navigation if it's a link
            async () => {
                const result = await browserAutomation.sendCommand('Runtime.evaluate', {
                    expression: `
                        (() => {
                            const element = document.querySelector("${step.params.selector}");
                            if (!element) return { success: false };
                            
                            // If element is a link or has a link inside
                            let href = null;
                            if (element.tagName === 'A') {
                                href = element.href;
                            } else {
                                const link = element.querySelector('a[href]');
                                if (link) href = link.href;
                            }
                            
                            if (href) {
                                console.log("Attempting direct navigation to: " + href);
                                window.location.href = href;
                                return { success: true, href };
                            }
                            
                            return { success: false };
                        })()
                    `,
                    returnByValue: true
                }, step.sessionId);

                return result.result.value && result.result.value.success;
            }
        ];

        // Try each click method until one succeeds
        for (let i = 0; i < clickMethods.length; i++) {
            try {
                const success = await clickMethods[i]();
                if (success) {
                    logger.info(`Click succeeded using method ${i + 1}`);
                    // Wait a bit to let the click take effect
                    await new Promise(resolve => setTimeout(resolve, 300));
                    return step;
                }
            } catch (error) {
                logger.warn(`Click method ${i + 1} failed: ${error.message}`);
            }
        }

        throw new Error('Failed to click element using all available methods');

    } catch (error) {
        logger.error(`Error during click action: ${error.message}`);
        throw error;
    }
}

module.exports = { handleClick };