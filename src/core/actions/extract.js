const { logger } = require('../../utils/logger');

/**
 * Handles the 'extract' action by extracting data from the page
 * @param {Object} step - The step to execute
 * @param {Object} context - The execution context containing browserAutomation and nlpProcessor instances
 * @returns {Object} The updated step object with extracted data
 */
async function handleExtract(step, context) {
    const { browserAutomation, nlpProcessor } = context;

    if (!step.sessionId) {
        throw new Error('Session ID required for extract action');
    }
    
    // Get the full HTML of the page
    const docResult = await browserAutomation.sendCommand('DOM.getDocument', {
        depth: -1
    }, step.sessionId);
    
    const nodeId = docResult.result.root.nodeId;
    const outerHTMLResult = await browserAutomation.sendCommand('DOM.getOuterHTML', {
        nodeId: nodeId
    }, step.sessionId);
    
    const pageHTML = outerHTMLResult.result.outerHTML;
    
    // Extract data using NLP
    logger.info('Extracting data from page...');
    const extractedData = await nlpProcessor.extractDataFromPage(
        pageHTML, 
        step.params.instructions || 'Extract all visible text content'
    );
    
    // Store the extracted data in the step for the response
    step.extractedData = extractedData;
    logger.info('Data extraction completed');
    
    return step;
}

module.exports = { handleExtract };
