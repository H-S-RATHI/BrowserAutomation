const { logger } = require('../../utils/logger');
const { retryWithBackoff } = require('./retryWithBackoff');
const { cleanHtml } = require('./cleanHtml');

/**
 * Extracts structured data from a webpage based on instructions
 * @param {string} pageHtml - The HTML content of the page
 * @param {string} instructions - Instructions for what data to extracty
 * @param {Object} model - AI model instance
 * @returns {Promise<Object>} Extracted data in structured format
 */
async function extractDataFromPage(pageHtml, instructions, model) {
    try {
        // Clean HTML before sending to AI
        const cleanedHtml = cleanHtml(pageHtml);
        
        const prompt = `You are an expert in web data extraction. Analyze the provided HTML and extract the requested data.

Instructions: ${instructions}

HTML:
${cleanedHtml}

Please return the data in a structured JSON format with these requirements:
1. Use appropriate data types (strings, numbers, arrays, objects)
2. Include proper field names that describe the data
3. If extracting multiple items, use arrays
4. If extracting related data, use nested objects
5. Include timestamps for date-related data
6. Handle different data formats appropriately

Example output format:
{
    "title": "Page Title",
    "author": "John Doe",
    "datePublished": "2025-04-06T12:00:00",
    "content": [
        {
            "section": "Introduction",
            "text": "Some text..."
        },
        {
            "section": "Main Content",
            "text": "More text..."
        }
    ],
    "metadata": {
        "tags": ["tag1", "tag2"],
        "category": "Category Name"
    }
}`;

        const result = await retryWithBackoff(async () => {
            const response = await model.generateContent(prompt);
            return response;
        });

        const text = await result.response.text();
        logger.info('AI Response:', text);

        // Extract JSON from the response
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('Failed to extract JSON from AI response');
        }

        const extractedData = JSON.parse(jsonMatch[0]);
        
        // Add metadata about the extraction
        const structuredData = {
            data: extractedData,
            metadata: {
                extractionTimestamp: new Date().toISOString(),
                instructions,
                source: 'AI extraction',
                confidence: 0.95 // Default confidence level
            }
        };

        return structuredData;
    } catch (error) {
        logger.error('Failed to extract data from page:', error);
        throw error;
    }
}

module.exports = { extractDataFromPage };
