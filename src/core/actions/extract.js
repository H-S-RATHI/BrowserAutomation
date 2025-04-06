const { logger } = require('../../utils/logger');
const { DataStorage } = require('../../services/DataStorage');

/**
 * Handles data extraction from a webpage
 * @param {Object} step - The step object containing extraction parameters
 * @param {Object} context - The execution context
 * @returns {Promise<Object>} The updated step with extracted data
 */
async function handleExtract(step, context) {
    const { browserAutomation, nlpProcessor } = context;
    
    if (!step.sessionId) {
        throw new Error('Session ID required for extract action');
    }

    try {
        // Get the DOM node for the entire page
        const documentResult = await browserAutomation.sendCommand('DOM.getDocument', {
            depth: -1
        }, step.sessionId);

        const nodeId = documentResult.result.root.nodeId;
        const outerHTMLResult = await browserAutomation.sendCommand('DOM.getOuterHTML', {
            nodeId: nodeId
        }, step.sessionId);

        const pageHTML = outerHTMLResult.result.outerHTML;
        
        // Enhanced extraction with structured data
        logger.info('Starting data extraction...');
        
        // Get the extraction instructions
        const instructions = step.params.instructions || 'Extract all visible text content';
        
        // Extract data using NLP
        const extractedData = await nlpProcessor.extractDataFromPage(
            pageHTML, 
            instructions
        );

        // Store the extracted data
        const dataStorage = new DataStorage();
        const storageInfo = {
            filename: await dataStorage.saveData(extractedData, 'structured_data'),
            timestamp: new Date().toISOString(),
            instructions
        };

        // Store the storage info in the step
        step.extractedData = {
            data: extractedData,
            storageInfo
        };

        // Log the extraction details
        logger.info('Data extraction completed');

        return step;
    } catch (error) {
        logger.error('Error in extract action:', error);
        throw error;
    }
}

module.exports = { handleExtract };
