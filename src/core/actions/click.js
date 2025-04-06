const { logger } = require('../../utils/logger');

/**
 * Handles the 'click' action by finding and clicking on elements
 * @param {Object} step - The step to execute
 * @param {Object} context - The execution context containing browserAutomation and nlpProcessor instances
 * @returns {Object} The updated step object
 */
async function handleClick(step, context) {
    const { browserAutomation, nlpProcessor } = context;

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
    
    logger.info(`Using selector: ${step.params.selector}`);
    
    try {
        // Get the DOM node for the element
        const documentResult = await browserAutomation.sendCommand('DOM.getDocument', {
            depth: 1
        }, step.sessionId);
        
        const rootNodeId = documentResult.result.root.nodeId;
        
        // Find the element
        const queryResult = await browserAutomation.sendCommand('DOM.querySelector', {
            nodeId: rootNodeId,
            selector: step.params.selector
        }, step.sessionId);
        
        if (!queryResult.result.nodeId) {
            throw new Error(`Element not found with selector: ${step.params.selector}`);
        }
        
        const nodeId = queryResult.result.nodeId;
        
        // Get element information
        const boxModel = await browserAutomation.sendCommand('DOM.getBoxModel', {
            nodeId: nodeId
        }, step.sessionId);
        
        if (!boxModel.result || !boxModel.result.model) {
            throw new Error('Could not get element dimensions');
        }
        
        // Scroll element into view
        await browserAutomation.sendCommand('Runtime.evaluate', {
            expression: `
                (() => {
                    const element = document.querySelector("${step.params.selector}");
                    if (!element) return false;
                    
                    // Scroll element into view
                    element.scrollIntoView({behavior: 'instant', block: 'center'});
                    return true;
                })()
            `,
            returnByValue: true
        }, step.sessionId);
        
        // Wait a moment for scrolling to complete
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Check if element is visible and interactable
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
                    
                    if (!isVisible) {
                        return { 
                            visible: false, 
                            reason: "Element is not visible", 
                            details: {
                                width: rect.width,
                                height: rect.height,
                                display: style.display,
                                visibility: style.visibility,
                                opacity: style.opacity
                            }
                        };
                    }
                    
                    // Check if element is covered by another element
                    const centerX = rect.left + rect.width / 2;
                    const centerY = rect.top + rect.height / 2;
                    const elementAtPoint = document.elementFromPoint(centerX, centerY);
                    
                    if (!elementAtPoint) {
                        return { visible: false, reason: "No element at center point" };
                    }
                    
                    const isCovered = !element.contains(elementAtPoint) && !elementAtPoint.contains(element);
                    
                    if (isCovered) {
                        return { 
                            visible: false, 
                            reason: "Element is covered by another element",
                            coveringElement: elementAtPoint.tagName,
                            coveringElementId: elementAtPoint.id,
                            coveringElementClass: elementAtPoint.className
                        };
                    }
                    
                    return { 
                        visible: true,
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
        
        if (!visibilityCheck.result.result.visible) {
            logger.warn(`Element not visible: ${JSON.stringify(visibilityCheck.result.result)}`);
            
            // Try to make the element visible
            await browserAutomation.sendCommand('Runtime.evaluate', {
                expression: `
                    (() => {
                        const element = document.querySelector("${step.params.selector}");
                        if (!element) return false;
                        
                        // Force visibility
                        element.style.display = "block";
                        element.style.visibility = "visible";
                        element.style.opacity = "1";
                        
                        // Scroll again
                        element.scrollIntoView({behavior: 'instant', block: 'center'});
                        return true;
                    })()
                `,
                returnByValue: true
            }, step.sessionId);
            
            // Wait a moment for changes to take effect
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        // Method 1: Use DOM.focus and Input.dispatchMouseEvent
        try {
            // Focus the element
            await browserAutomation.sendCommand('DOM.focus', {
                nodeId: nodeId
            }, step.sessionId);
            
            // Get updated box model after scrolling
            const updatedBoxModel = await browserAutomation.sendCommand('DOM.getBoxModel', {
                nodeId: nodeId
            }, step.sessionId);
            
            if (updatedBoxModel.result && updatedBoxModel.result.model) {
                const { content } = updatedBoxModel.result.model;
                
                // Calculate center point
                const centerX = (content[0] + content[2] + content[4] + content[6]) / 4;
                const centerY = (content[1] + content[3] + content[5] + content[7]) / 4;
                
                // Mouse down
                await browserAutomation.sendCommand('Input.dispatchMouseEvent', {
                    type: 'mousePressed',
                    x: centerX,
                    y: centerY,
                    button: 'left',
                    clickCount: 1
                }, step.sessionId);
                
                // Small delay
                await new Promise(resolve => setTimeout(resolve, 50));
                
                // Mouse up
                await browserAutomation.sendCommand('Input.dispatchMouseEvent', {
                    type: 'mouseReleased',
                    x: centerX,
                    y: centerY,
                    button: 'left',
                    clickCount: 1
                }, step.sessionId);
                
                logger.info(`Clicked element at coordinates: (${centerX}, ${centerY})`);
            }
        } catch (error) {
            logger.warn(`Method 1 failed: ${error.message}`);
        }
        
        // Wait a moment to see if the click had an effect
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Method 2: Use JavaScript click()
        try {
            logger.info('Trying JavaScript click() method');
            await browserAutomation.sendCommand('Runtime.evaluate', {
                expression: `
                    (() => {
                        const element = document.querySelector("${step.params.selector}");
                        if (!element) return false;
                        
                        // Try multiple click approaches
                        try {
                            // Standard click
                            element.click();
                            console.log("Standard click executed");
                            
                            // Dispatch click event
                            const clickEvent = new MouseEvent('click', {
                                view: window,
                                bubbles: true,
                                cancelable: true
                            });
                            element.dispatchEvent(clickEvent);
                            console.log("Click event dispatched");
                            
                            return true;
                        } catch (e) {
                            console.error("Click error:", e);
                            return false;
                        }
                    })()
                `,
                returnByValue: true
            }, step.sessionId);
        } catch (error) {
            logger.warn(`Method 2 failed: ${error.message}`);
        }
        
        // Wait a moment to see if the click had an effect
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Method 3: Try to click any link or button inside the element
        try {
            logger.info('Trying to click child links or buttons');
            await browserAutomation.sendCommand('Runtime.evaluate', {
                expression: `
                    (() => {
                        const element = document.querySelector("${step.params.selector}");
                        if (!element) return false;
                        
                        // Try to find and click links or buttons inside
                        const clickables = element.querySelectorAll('a, button, input[type="submit"], input[type="button"]');
                        if (clickables.length > 0) {
                            console.log("Found " + clickables.length + " clickable elements inside");
                            clickables[0].click();
                            return true;
                        }
                        
                        // If the element itself is a link or button, try to navigate directly
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
        } catch (error) {
            logger.warn(`Method 3 failed: ${error.message}`);
        }
        
        logger.info('Click action completed with multiple methods');
    } catch (error) {
        logger.error(`Error during click action: ${error.message}`);
        
        // Final fallback - try a direct click by selector
        try {
            logger.info('Trying fallback direct click by selector');
            await browserAutomation.sendCommand('Runtime.evaluate', {
                expression: `
                    (() => {
                        try {
                            // Try to find the element
                            const element = document.querySelector("${step.params.selector}");
                            if (!element) {
                                // Try XPath as a last resort
                                const xpathResult = document.evaluate(
                                    "//*[contains(text(), '${step.params.description?.replace(/'/g, "\\'")}')]", 
                                    document, 
                                    null, 
                                    XPathResult.FIRST_ORDERED_NODE_TYPE, 
                                    null
                                );
                                
                                if (xpathResult && xpathResult.singleNodeValue) {
                                    xpathResult.singleNodeValue.click();
                                    return "Clicked element found by XPath text search";
                                }
                                
                                return "Element not found by selector or XPath";
                            }
                            
                            // Force the element to be visible and clickable
                            element.style.display = "block";
                            element.style.visibility = "visible";
                            element.style.opacity = "1";
                            element.style.pointerEvents = "auto";
                            
                            // Scroll into view
                            element.scrollIntoView({behavior: 'instant', block: 'center'});
                            
                            // Wait a moment
                            setTimeout(() => {
                                // Click the element
                                element.click();
                                
                                // If it's a link, navigate directly
                                if (element.tagName === 'A' && element.href) {
                                    window.location.href = element.href;
                                }
                            }, 100);
                            
                            return "Fallback click initiated";
                        } catch (e) {
                            return "Fallback error: " + e.message;
                        }
                    })()
                `,
                returnByValue: true
            }, step.sessionId);
        } catch (fallbackError) {
            logger.error(`Fallback method also failed: ${fallbackError.message}`);
        }
    }
    
    return step;
}

module.exports = { handleClick };
