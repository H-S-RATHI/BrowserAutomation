const { GoogleGenerativeAI } = require('@google/generative-ai');
const { logger } = require('../utils/logger');

class NLPProcessor {
    constructor(apiKey) {
        this.genAI = new GoogleGenerativeAI(apiKey);
        this.model = this.genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        this.retryDelay = 1000; // 1 second
        this.maxRetries = 3;
    }

    async retryWithBackoff(operation) {
        let lastError;
        for (let i = 0; i < this.maxRetries; i++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error;
                if (error.message.includes('429') || error.message.includes('Rate limit')) {
                    const delay = this.retryDelay * Math.pow(2, i);
                    logger.warn(`Rate limit hit, retrying in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }
                throw error;
            }
        }
        throw lastError;
    }

    async processCommand(command) {
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
            
            const result = await this.retryWithBackoff(async () => {
                const response = await this.model.generateContent(prompt);
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
    

    async findElementSelector(pageHtml, elementDescription) {
        try {
            // Clean and prepare HTML before sending to AI
            const cleanHtml = this.cleanHtml(pageHtml);
            
            const prompt = `You are a web automation expert specializing in XPath and CSS selectors.
            
            Based on the following HTML and element description, provide the most reliable CSS selector or XPath to locate the element.
            
            Return only the selector as a JSON object like this:
            {
                "selectorType": "css|xpath",
                "selector": "the selector string"
            }
            
            Element description: ${elementDescription}
            
            HTML:
            ${cleanHtml}`;
            
            const result = await this.retryWithBackoff(async () => {
                const response = await this.model.generateContent(prompt);
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
            logger.info(`Found selector for "${elementDescription}":`, selectorInfo);
            return selectorInfo;
        } catch (error) {
            logger.error('Failed to find element selector:', error);
            throw error;
        }
    }

    async extractDataFromPage(pageHtml, extractionInstructions) {
        try {
            // Clean and prepare HTML before sending to AI
            const cleanHtml = this.cleanHtml(pageHtml);
            
            const prompt = `You are a web scraping expert specializing in data extraction.
            
            Extract the following information from the provided HTML:
            ${extractionInstructions}
            
            Return the extracted data as a JSON object with appropriate fields.
            
            HTML:
            ${cleanHtml}`;
            
            const result = await this.retryWithBackoff(async () => {
                const response = await this.model.generateContent(prompt);
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

    cleanHtml(html) {
        // Remove script and style tags to reduce size and noise
        let cleanedHtml = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
        cleanedHtml = cleanedHtml.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
        
        // Remove comments
        cleanedHtml = cleanedHtml.replace(/<!--[\s\S]*?-->/g, '');
        
        // Truncate the HTML if it's too large (keeping important parts like form elements)
        if (cleanedHtml.length > 50000) {
            // Extract body or main content area
            const bodyMatch = cleanedHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
            if (bodyMatch && bodyMatch[1]) {
                cleanedHtml = bodyMatch[1];
            }
            
            // Further truncate if still too large, but keep forms, inputs, buttons
            if (cleanedHtml.length > 50000) {
                // Extract all forms
                const forms = [];
                const formRegex = /<form[^>]*>[\s\S]*?<\/form>/gi;
                let formMatch;
                while ((formMatch = formRegex.exec(cleanedHtml)) !== null) {
                    forms.push(formMatch[0]);
                }
                
                // Extract important elements
                const importantElements = [];
                const elementRegex = /<(input|button|a|select|textarea)[^>]*>[\s\S]*?(?:<\/\1>|\/?>)/gi;
                let elementMatch;
                while ((elementMatch = elementRegex.exec(cleanedHtml)) !== null) {
                    importantElements.push(elementMatch[0]);
                }
                
                // Combine them with a sample of the rest
                cleanedHtml = `<div class="important-content">
                    ${forms.join('\n')}
                    ${importantElements.join('\n')}
                    ${cleanedHtml.substring(0, 20000)}...
                </div>`;
            }
        }
        
        return cleanedHtml;
    }
}

module.exports = { NLPProcessor };