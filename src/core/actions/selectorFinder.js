const { logger } = require('../../utils/logger');
const { findElementSelector } = require('../../services/nlp/findElementSelector');

/**
 * Action handler for finding selectors and XPaths for elements
 * @param {Object} step - The step to execute 
 * @param {Object} context - The execution context containing browserAutomation and nlpProcessor instances
 * @returns {Object} The updated step object with selector information
 */
async function handleSelectorFinder(step, context) {
    const { browserAutomation, nlpProcessor } = context;
    
    // Ensure we have a session ID
    if (!step.sessionId) {
        throw new Error('Session ID required for selector finding action');
    }
    
    // If a selector is already provided, just use it without AI analysis
    if (step.params.selector) {
        logger.info(`Using provided selector: ${step.params.selector}`);
        
        // Store the selector information in the step result
        step.result = {
            selectorInfo: {
                selector: step.params.selector,
                confidence: 1.0,
                explanation: "Selector provided directly in the plan"
            },
            success: true
        };
        
        return step;
    }
    
    // Get the element description from the step parameters
    const elementDescription = step.params.description;
    if (!elementDescription) {
        throw new Error('Either selector or element description is required for selector finding');
    }
    
    // Get the page HTML
    logger.info('Getting page HTML for element analysis...');
    const docResult = await browserAutomation.sendCommand('DOM.getDocument', {
        depth: -1
    }, step.sessionId);
    
    const nodeId = docResult.result.root.nodeId;
    const outerHTMLResult = await browserAutomation.sendCommand('DOM.getOuterHTML', {
        nodeId: nodeId
    }, step.sessionId);
    
    const pageHTML = outerHTMLResult.result.outerHTML;
    
    // Use the NLP processor to find the selector
    logger.info(`Finding selector for form here: ${elementDescription}`);
    const selectorInfo = await nlpProcessor.findElementSelector(pageHTML, elementDescription);
    
    // Store the selector information in the step result
    step.result = {
        selectorInfo,
        success: true
    };
    
    logger.info(`Found selector information for "${elementDescription}":`, selectorInfo);
    
    return step;
}

module.exports = { handleSelectorFinder };
