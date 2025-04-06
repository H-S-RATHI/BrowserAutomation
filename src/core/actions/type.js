const { logger } = require('../../utils/logger');

/**
 * Handles the 'type' action by typing text into form fields
 * @param {Object} step - The step to execute
 * @param {Object} context - The execution context containing browserAutomation and nlpProcessor instances
 * @returns {Object} The updated step object
 */
async function handleType(step, context) {
    const { browserAutomation } = context;

    if (!step.sessionId) {
        throw new Error('Session ID required for type action');
    }
    
    const text = step.params.text || '';
    logger.info(`Typing text: "${text}"`);
    
    // Get the selector from the previous findSelector step
    if (!step.params.selector) {
        if (step.selector) {
            step.params.selector = step.selector;
        } else {
            throw new Error('Selector is required for type action');
        }
    }

    try {
        // Get the DOM node for the input element
        const documentResult = await browserAutomation.sendCommand('DOM.getDocument', {
            depth: 1
        }, step.sessionId);
        
        const rootNodeId = documentResult.result.root.nodeId;
        
        // Find the input element
        const queryResult = await browserAutomation.sendCommand('DOM.querySelector', {
            nodeId: rootNodeId,
            selector: step.params.selector
        }, step.sessionId);
        
        if (!queryResult.result.nodeId) {
            throw new Error(`Element not found with selector: ${step.params.selector}`);
        }
        
        const nodeId = queryResult.result.nodeId;
        
        // Focus the element
        await browserAutomation.sendCommand('DOM.focus', {
            nodeId: nodeId
        }, step.sessionId);
        
        // Clear existing text with DOM.setAttributeValue
        await browserAutomation.sendCommand('DOM.setAttributeValue', {
            nodeId: nodeId,
            name: 'value',
            value: ''
        }, step.sessionId);
        
        // Wait a moment
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Set the value using DOM.setAttributeValue
        await browserAutomation.sendCommand('DOM.setAttributeValue', {
            nodeId: nodeId,
            name: 'value',
            value: text
        }, step.sessionId);
        
        // Dispatch input and change events
        await browserAutomation.sendCommand('Runtime.evaluate', {
            expression: `
                (() => {
                    const element = document.querySelector("${step.params.selector}");
                    if (!element) return false;
                    
                    // Dispatch input event
                    const inputEvent = new Event('input', { bubbles: true });
                    element.dispatchEvent(inputEvent);
                    
                    // Dispatch change event
                    const changeEvent = new Event('change', { bubbles: true });
                    element.dispatchEvent(changeEvent);
                    
                    return element.value;
                })()
            `,
            returnByValue: true
        }, step.sessionId);
        
        // Verify the text was entered correctly
        const verifyResult = await browserAutomation.sendCommand('Runtime.evaluate', {
            expression: `
                (() => {
                    const input = document.querySelector("${step.params.selector}");
                    if (!input) return "Element not found";
                    return input.value;
                })()
            `,
            returnByValue: true
        }, step.sessionId);
        
        logger.info(`Verification - Current input value: "${verifyResult.result.result}"`);
    } catch (error) {
        logger.error(`Error during text input: ${error.message}`);
        throw error;
    }
    
    logger.info('Type action completed');
    return step;
}

module.exports = { handleType };