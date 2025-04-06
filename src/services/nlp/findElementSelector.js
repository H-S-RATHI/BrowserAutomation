const { logger } = require('../../utils/logger');
const { retryWithBackoff } = require('./retryWithBackoff');
const { cleanHtml } = require('./cleanHtml');

/**
 * Finds a CSS selector for an element described in natural language
 * @param {string} pageHtml - The HTML content of the page
 * @param {string} elementDescription - Natural language description of the element to find
 * @param {object} model - The Gemini model instance
 * @returns {Object} - Object containing the selector and possibly a submit selector
 */
async function findElementSelector(pageHtml, elementDescription, model) {
    try {
        // Clean HTML before sending to AI
        const cleanedHtml = cleanHtml(pageHtml);
        
        const prompt = `You are an expert in HTML and CSS selectors. Analyze the provided HTML and find the best and exact CSS selector for the element described.

Description: ${elementDescription}

Return a valid JSON object in this format:
{
    "selector": "the most precise CSS selector to target the element",
    "confidence": 0.95,
    "explanation": "Brief explanation of why this is the best selector"
}

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
            throw new Error('Failed to extract selector from AI response');
        }
        
        const selectorInfo = JSON.parse(jsonMatch[0]);
        return selectorInfo;
    } catch (error) {
        logger.error('Failed to find element selector:', error);
        throw error;
    }
}

module.exports = { findElementSelector };
