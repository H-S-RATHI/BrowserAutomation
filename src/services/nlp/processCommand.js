const { logger } = require('../../utils/logger');
const { retryWithBackoff } = require('./retryWithBackoff');

/**
 * Processes a natural language command and converts it into a structured automation plan
 * @param {string} command - The natural language command to process
 * @param {object} model - The Gemini model instance
 * @returns {Object} - The structured automation plan
 */
async function processCommand(command, model) {
    try {
        // Ask Gemini to create a detailed plan for the command
        const prompt = `You are a browser automation expert. Convert the following natural language command into a detailed step-by-step plan.
        
Return a valid JSON object in this exact format (all property names must be double-quoted):
{
    "task": "Brief description of the overall task",
    "steps": [
        {
            "action": "navigate|fnid|search|login|click|type|extract|scroll|wait",
            "description": "Human-readable description of this step",
            "params": {
                "url": "URL if applicable",
                "selector": "CSS selector if known",
                "text": "Text to type if applicable",
                "data": "Additional data needed for this step"
            }
        }
    ]
}

Important: 
- Use double quotes for all property names and string values
- Do not include any text before or after the JSON object
- Do not include any comments or explanations
- Ensure all JSON syntax is valid
- Make sure to include all required commas and braces

Command: ${command}`;
        
        const result = await retryWithBackoff(async () => {
            const response = await model.generateContent(prompt);
            return response;
        });
        
        const response = await result.response;
        const text = await response.text();

        // Extract JSON from the response using a regex that captures from { to the final }
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            logger.error('AI Response:', text);
            throw new Error('Failed to extract JSON from AI response');
        }
        
        // Start with the raw JSON string from the match
        let jsonStr = jsonMatch[0];
        
        // Fix unquoted property names: match keys following a { or , and wrap them in double quotes if not already quoted.
        jsonStr = jsonStr.replace(/([{,]\s*)([A-Za-z0-9_]+)\s*:/g, '$1"$2":');
        
        // Remove any trailing commas before closing braces/brackets
        jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1');
        
        // Trim extra whitespace
        jsonStr = jsonStr.trim();

        try {
            const plan = JSON.parse(jsonStr);
            logger.info('Generated automation plan:', JSON.stringify(plan, null, 2));
            return plan;
        } catch (parseError) {
            logger.error('Failed to parse JSON:', parseError);
            logger.error('Original AI Response:', text);
            logger.error('Cleaned JSON String:', jsonStr);
            throw new Error(`JSON parsing failed: ${parseError.message}\nCleaned JSON: ${jsonStr}`);
        }
    } catch (error) {
        logger.error('Failed to process command:', error);
        throw error;
    }
}

module.exports = { processCommand };
