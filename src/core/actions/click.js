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
    
    // If selector is not provided, use AI to find it
    if (!step.params.selector && step.params.description) {
        // Get page HTML
        const docResult = await browserAutomation.sendCommand('DOM.getDocument', {
            depth: -1
        }, step.sessionId);
        
        const nodeId = docResult.result.root.nodeId;
        const outerHTMLResult = await browserAutomation.sendCommand('DOM.getOuterHTML', {
            nodeId: nodeId
        }, step.sessionId);
        
        const pageHTML = outerHTMLResult.result.outerHTML;
        
        // Use NLP to find the element selector
        logger.info(`Getting click selector for: ${step.params.description}`);
        const selectorInfo = await nlpProcessor.findElementSelector(
            pageHTML, 
            step.params.description
        );
        
        if (!selectorInfo || !selectorInfo.selector) {
            throw new Error(`Could not find click selector for: ${step.params.description}`);
        }
        
        step.params.selector = selectorInfo.selector;
        logger.info(`Found click selector: ${step.params.selector}`);
    }
    
    // Ensure element is visible and scroll it into view
    logger.info(`Scrolling element into view: ${step.params.selector}`);
    await browserAutomation.sendCommand('Runtime.evaluate', {
        expression: `
            (() => {
                const element = document.querySelector('${step.params.selector}');
                if (!element) {
                    return false;
                }
                
                // Check if element is visible
                const rect = element.getBoundingClientRect();
                const isVisible = !!(rect.width && rect.height);
                
                if (isVisible) {
                    // Scroll element into center of viewport
                    element.scrollIntoView({behavior: 'instant', block: 'center'});
                    return true;
                } else {
                    return false;
                }
            })()
        `,
        returnByValue: true
    }, step.sessionId);
    
    // Wait a moment for scrolling to complete
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Perform the click with JavaScript
    logger.info(`Clicking element: ${step.params.selector}`);
    await browserAutomation.sendCommand('Runtime.evaluate', {
        expression: `
            (() => {
                const element = document.querySelector('${step.params.selector}');
                if (!element) {
                    return false;
                }
                
                // Try a regular click first
                try {
                    element.click();
                    return true;
                } catch (err) {
                    // If regular click fails, try synthetic click event
                    try {
                        const event = new MouseEvent('click', {
                            view: window,
                            bubbles: true,
                            cancelable: true
                        });
                        element.dispatchEvent(event);
                        return true;
                    } catch (err2) {
                        return false;
                    }
                }
            })()
        `,
        returnByValue: true
    }, step.sessionId);
    
    // Wait for possible navigation or state change after click
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    logger.info('Click action completed');
    return step;
}

module.exports = { handleClick };
