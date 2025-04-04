const { logger } = require('../../utils/logger');

/**
 * Handles the 'type' action by typing text into form fields
 * @param {Object} step - The step to execute
 * @param {Object} context - The execution context containing browserAutomation and nlpProcessor instances
 * @returns {Object} The updated step object
 */
async function handleType(step, context) {
    const { browserAutomation, nlpProcessor } = context;

    if (!step.sessionId) {
        throw new Error('Session ID required for type action');
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
        logger.info(`Getting input selector for: ${step.params.description}`);
        const selectorInfo = await nlpProcessor.findElementSelector(
            pageHTML, 
            step.params.description
        );
        
        if (!selectorInfo || !selectorInfo.selector) {
            throw new Error(`Could not find input selector for: ${step.params.description}`);
        }
        
        step.params.selector = selectorInfo.selector;
        logger.info(`Found input selector: ${step.params.selector}`);
    }
    
    // First ensure the element is visible
    logger.info('Checking element visibility and scrolling if needed...');
    await browserAutomation.sendCommand('Runtime.evaluate', {
        expression: `
            (() => {
                const element = document.querySelector('${step.params.selector}');
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
    logger.info('Focusing on input element...');
    const focusResult = await browserAutomation.sendCommand('Runtime.evaluate', {
        expression: `
            (() => {
                const element = document.querySelector('${step.params.selector}');
                if (!element) return false;
                
                // Clear any existing value first
                element.value = '';
                
                // Multiple focus methods for better compatibility
                element.focus();
                
                // Click to ensure focus on some stubborn sites
                element.click();
                
                return document.activeElement === element;
            })()
        `,
        returnByValue: true
    }, step.sessionId);
    
    // Check if focus was successful
    if (!focusResult.result.result) {
        logger.warn('Failed to focus on input, attempting alternative methods...');
        
        // Try again with a delay
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        await browserAutomation.sendCommand('Runtime.evaluate', {
            expression: `document.querySelector('${step.params.selector}').click()`
        }, step.sessionId);
    }
    
    const text = step.params.text || '';
    logger.info(`Typing text: "${text}"`);
    
    // Set value and trigger input events
    await browserAutomation.sendCommand('Runtime.evaluate', {
        expression: `
            (() => {
                const element = document.querySelector('${step.params.selector}');
                if (!element) return false;
                
                // Set value and dispatch events
                element.value = '${text.replace(/'/g, "\\'")}';
                
                // Trigger input and change events
                element.dispatchEvent(new Event('input', { bubbles: true }));
                element.dispatchEvent(new Event('change', { bubbles: true }));
                
                return true;
            })()
        `
    }, step.sessionId);
    
    // Also use Input.insertText as a fallback
    await browserAutomation.sendCommand('Input.insertText', {
        text: text
    }, step.sessionId);
    
    // Verify the text was entered
    const verifyResult = await browserAutomation.sendCommand('Runtime.evaluate', {
        expression: `document.querySelector('${step.params.selector}').value`,
        returnByValue: true
    }, step.sessionId);
    
    logger.info(`Verification - Current input value: "${verifyResult.result.result}"`);
    logger.info('Type action completed');
    
    return step;
}

module.exports = { handleType };
