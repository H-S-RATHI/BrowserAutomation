const { logger } = require('../../utils/logger');

/**
 * Handles the 'search' action by finding and interacting with search boxes on web pages
 * @param {Object} step - The step to execute 
 * @param {Object} context - The execution context containing browserAutomation and nlpProcessor instances
 * @returns {Object} The updated step object with sessionId
 */
async function handleSearch(step, context) {
    const { browserAutomation, nlpProcessor } = context;

    // Create new tab only if no sessionId exists AND we don't have a previous step with session
    if (!step.sessionId) {
        logger.info('No existing session found, creating new tab for search');
        const createTargetResponse = await browserAutomation.sendCommand('Target.createTarget', {
            url: 'about:blank'
        });
        
        const targetId = createTargetResponse.result.targetId;
        if (!targetId) {
            throw new Error('Failed to create new browser tab');
        }

        const attachResponse = await browserAutomation.sendCommand('Target.attachToTarget', {
            targetId: targetId,
            flatten: true
        });

        if (!attachResponse.result.sessionId) {
            throw new Error('Failed to attach to target');
        }

        const sessionId = attachResponse.result.sessionId;
        step.sessionId = sessionId;
        
        // Enable required domains
        await browserAutomation.sendCommand('Page.enable', {}, sessionId);
        await browserAutomation.sendCommand('DOM.enable', {}, sessionId);
        await browserAutomation.sendCommand('Runtime.enable', {}, sessionId);
        await browserAutomation.sendCommand('Network.enable', {}, sessionId);
        
        // Navigation event listeners
        await browserAutomation.sendCommand('Page.setLifecycleEventsEnabled', { 
            enabled: true 
        }, sessionId);
        
        // Navigate to the URL if provided
        if (step.params.url) {
            logger.info(`Navigating to search URL: ${step.params.url}`);
            await browserAutomation.sendCommand('Page.navigate', { 
                url: step.params.url
            }, sessionId);
            
            // Wait for navigation to complete and page to be interactive
            logger.info('Waiting for page to load completely...');
            
            // Initial wait to allow page to start loading
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Wait for DOM content to be loaded
            await browserAutomation.sendCommand('Runtime.evaluate', {
                expression: `
                    new Promise((resolve) => {
                        if (document.readyState === 'complete') {
                            resolve();
                        } else {
                            window.addEventListener('load', resolve);
                        }
                    })
                `,
                awaitPromise: true
            }, sessionId);
            
            // Additional wait for any JavaScript to initialize
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            logger.info('Page loaded completely');
        }
    }
    
    // Get the full HTML of the page
    logger.info('Getting page HTML for search element analysis...');
    const docResult = await browserAutomation.sendCommand('DOM.getDocument', {
        depth: -1
    }, step.sessionId);
    
    const nodeId = docResult.result.root.nodeId;
    const outerHTMLResult = await browserAutomation.sendCommand('DOM.getOuterHTML', {
        nodeId: nodeId
    }, step.sessionId);
    
    const pageHTML = outerHTMLResult.result.outerHTML;
    
    // Use NLP to find the search box selector with more specific description
    logger.info('Getting search box selector using AI...');
    const searchQuery = step.params.query || step.params.text || 'content';
    const selectorInfo = await nlpProcessor.findElementSelector(
        pageHTML, 
        `Find the main search input field or search box where users would type "${searchQuery}"`
    );
    
    if (!selectorInfo || !selectorInfo.selector) {
        throw new Error('Could not find search box selector');
    }
    
    // Fill the search box using a more robust approach
    logger.info(`Found search selector: ${selectorInfo.selector}`);
    
    // First ensure the element is visible
    logger.info('Checking element visibility and scrolling if needed...');
    await browserAutomation.sendCommand('Runtime.evaluate', {
        expression: `
            (() => {
                const element = document.querySelector('${selectorInfo.selector}');
                if (!element) {
                    return false;
                }
                
                // Scroll element into view
                element.scrollIntoView({behavior: 'instant', block: 'center'});
                return true;
            })()
        `
    }, step.sessionId);
    
    // Small wait after scrolling
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Focus on the element
    logger.info('Focusing on search element...');
    const focusResult = await browserAutomation.sendCommand('Runtime.evaluate', {
        expression: `
            (() => {
                const element = document.querySelector('${selectorInfo.selector}');
                if (!element) return false;
                
                // Clear any existing value first
                element.value = '';
                
                // Multiple focus methods for better compatibility
                element.focus();
                
                // Click to ensure focus on some stubborn sites
                const rect = element.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                    // Element has dimensions, safe to click
                    element.click();
                }
                
                return document.activeElement === element;
            })()
        `,
        returnByValue: true
    }, step.sessionId);
    
    // Check if focus was successful
    if (!focusResult.result.result) {
        logger.warn('Failed to focus on search box, attempting alternative methods...');
        
        // Try again with a delay
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        await browserAutomation.sendCommand('Runtime.evaluate', {
            expression: `document.querySelector('${selectorInfo.selector}').click()`
        }, step.sessionId);
    }
    
    // Use either query or text parameter (text is the standard in the API plan)
    const searchText = step.params.text || step.params.query || '';
    logger.info(`Typing search text: "${searchText}"`);
    
    // Alternative approach to set value and then trigger input events
    await browserAutomation.sendCommand('Runtime.evaluate', {
        expression: `
            (() => {
                const element = document.querySelector('${selectorInfo.selector}');
                if (!element) return false;
                
                // Set value and dispatch events
                element.value = '${searchText.replace(/'/g, "\\'")}';
                
                // Trigger input and change events
                element.dispatchEvent(new Event('input', { bubbles: true }));
                element.dispatchEvent(new Event('change', { bubbles: true }));
                
                return true;
            })()
        `
    }, step.sessionId);
    
    // Also use Input.insertText as a fallback
    await browserAutomation.sendCommand('Input.insertText', {
        text: searchText
    }, step.sessionId);
    
    // Small wait after typing
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Verify the text was entered
    const verifyResult = await browserAutomation.sendCommand('Runtime.evaluate', {
        expression: `document.querySelector('${selectorInfo.selector}').value`,
        returnByValue: true
    }, step.sessionId);
    
    logger.info(`Verification - Current search box value: "${verifyResult.result.result}"`);
    
    // Find and click the search button if needed
    if (selectorInfo.submitSelector) {
        logger.info(`Clicking search button: ${selectorInfo.submitSelector}`);
        await browserAutomation.sendCommand('Runtime.evaluate', {
            expression: `
                (() => {
                    const button = document.querySelector('${selectorInfo.submitSelector}');
                    if (!button) return false;
                    
                    // Scroll button into view
                    button.scrollIntoView({behavior: 'instant', block: 'center'});
                    
                    // Small delay to ensure it's visible
                    return new Promise(resolve => {
                        setTimeout(() => {
                            button.click();
                            resolve(true);
                        }, 300);
                    });
                })()
            `,
            awaitPromise: true
        }, step.sessionId);
    } else {
        // Press Enter key if no submit button
        logger.info('Pressing Enter key to submit search');
        
        // First dispatch keyDown event
        await browserAutomation.sendCommand('Input.dispatchKeyEvent', {
            type: 'keyDown',
            key: 'Enter',
            code: 'Enter',
            windowsVirtualKeyCode: 13
        }, step.sessionId);
        
        // Then dispatch keyUp event to complete the key press
        await browserAutomation.sendCommand('Input.dispatchKeyEvent', {
            type: 'keyUp',
            key: 'Enter',
            code: 'Enter',
            windowsVirtualKeyCode: 13
        }, step.sessionId);
        
        logger.info('Enter key pressed to submit search');
    }
    
    // Wait for search results to load
    logger.info('Waiting for search results to load...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Wait for any pending network requests to complete
    await browserAutomation.sendCommand('Runtime.evaluate', {
        expression: `
            new Promise((resolve) => {
                if (document.readyState === 'complete') {
                    resolve();
                } else {
                    window.addEventListener('load', resolve);
                }
            })
        `,
        awaitPromise: true
    }, step.sessionId);
    
    logger.info('Search completed');
    
    return step;
}

module.exports = { handleSearch };
