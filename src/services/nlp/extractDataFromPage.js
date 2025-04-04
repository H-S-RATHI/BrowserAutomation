const { logger } = require('../../utils/logger');
const { retryWithBackoff } = require('./retryWithBackoff');
const { cleanHtml } = require('./cleanHtml');

/**
 * Extracts structured data from a webpage based on instructions
 * @param {string} pageHtml - The HTML content of the page
 * @param {string} extractionInstructions - Instructions on what data to extract
 * @param {object} model - The Gemini model instance
 * @returns {Object} - Extracted data in structured format
 */
async function extractDataFromPage(pageHtml, extractionInstructions, model) {
    try {
        // Clean and prepare HTML before sending to AI
        const cleanedHtml = cleanHtml(pageHtml);
        
        const prompt = `You are a web scraping expert specializing in data extraction.
        
Extract the following information from the provided HTML:
${extractionInstructions}

Return the extracted data as a JSON object with appropriate fields.

HTML:
${cleanedHtml}`;
        
        const result = await retryWithBackoff(async () => {
            const response = await model.generateContent(prompt);
            return response;
        });
        
        const response = await result.response;
        const text = response.text();
        
        // Extract JSON from the response
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('Failed to extract data from AI response');
        }
        
        const extractedData = JSON.parse(jsonMatch[0]);
        logger.info('Extracted data:', extractedData);
        return extractedData;
    } catch (error) {
        logger.error('Failed to extract data from page:', error);
        throw error;
    }
}

module.exports = { extractDataFromPage };
