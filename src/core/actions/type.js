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
    
    // Check if we already have a selector from PlanExecutor
    if (!step.params.selector || !step.selectorVerified) {
        // If selector is not provided or not verified, use AI to find it
        if (step.params.description) {
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
            step.selectorVerified = true;
            logger.info(`Found input selector: ${step.params.selector}`);
        } else {
            throw new Error('No selector or element description provided for type action');
        }
    } else {
        logger.info(`Using verified selector: ${step.params.selector}`);
    }
    
    const text = step.params.text || '';
    logger.info(`Typing text: "${text}"`);
    
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

/**
 * Handles typing into a search box with verification
 * @param {Object} browserAutomation - The browser automation instance
 * @param {string} sessionId - The session ID
 * @param {string} selector - The CSS selector for the search box
 * @param {string} text - The text to type
 * @param {boolean} pressEnter - Whether to press Enter after typing (default: true)
 * @returns {Promise<void>}
 */
async function handleSearchBoxTyping(browserAutomation, sessionId, selector, text, pressEnter = true) {
    logger.info(`Typing into search box with selector: ${selector}`);
    
    // Get the DOM node for the input element
    const documentResult = await browserAutomation.sendCommand('DOM.getDocument', {
        depth: 1
    }, sessionId);
    
    const rootNodeId = documentResult.result.root.nodeId;
    
    // Find the input element
    const queryResult = await browserAutomation.sendCommand('DOM.querySelector', {
        nodeId: rootNodeId,
        selector: selector
    }, sessionId);
    
    if (!queryResult.result.nodeId) {
        throw new Error(`Search box not found with selector: ${selector}`);
    }
    
    const nodeId = queryResult.result.nodeId;
    
    // Focus the element
    await browserAutomation.sendCommand('DOM.focus', {
        nodeId: nodeId
    }, sessionId);
    
    // Clear existing text with DOM.setAttributeValue
    await browserAutomation.sendCommand('DOM.setAttributeValue', {
        nodeId: nodeId,
        name: 'value',
        value: ''
    }, sessionId);
    
    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Set the value using DOM.setAttributeValue
    await browserAutomation.sendCommand('DOM.setAttributeValue', {
        nodeId: nodeId,
        name: 'value',
        value: text
    }, sessionId);
    
    // Dispatch input and change events
    await browserAutomation.sendCommand('Runtime.evaluate', {
        expression: `
            (() => {
                const element = document.querySelector("${selector}");
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
    }, sessionId);
    
    // Verify the text was entered correctly
    const verifyResult = await browserAutomation.sendCommand('Runtime.evaluate', {
        expression: `
            (() => {
                const input = document.querySelector("${selector}");
                if (!input) return "Element not found";
                return input.value;
            })()
        `,
        returnByValue: true
    }, sessionId);
    
    logger.info(`Verification - Current search box value: "${verifyResult.result.result}"`);
}

module.exports = { handleType, handleSearchBoxTyping };