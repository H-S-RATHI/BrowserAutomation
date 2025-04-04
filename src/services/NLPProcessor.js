const { GoogleGenerativeAI } = require('@google/generative-ai');
const { logger } = require('../utils/logger');

class NLPProcessor {
    constructor() {
        this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
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

    async analyzeLoginForm(pageContent) {
        try {
            const prompt = `Analyze this HTML content and identify the login form elements. 
            Return a JSON object with the following selectors:
            - usernameSelector: CSS selector for username input
            - passwordSelector: CSS selector for password input
            - submitSelector: CSS selector for submit button
            
            HTML Content:
            ${pageContent}`;

            const result = await this.retryWithBackoff(async () => {
                const response = await this.model.generateContent(prompt);
                return response;
            });
            
            const response = await result.response;
            const text = response.text();
            
            // Extract JSON from the response
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('Failed to extract JSON from Gemini response');
            }
            
            const analysis = JSON.parse(jsonMatch[0]);
            logger.info('Login form analysis completed');
            return analysis;
        } catch (error) {
            logger.error('Failed to analyze login form:', error);
            throw error;
        }
    }

    async analyzeSearchForm(pageContent) {
        try {
            const prompt = `Analyze this HTML content and identify the search form elements.
            Return a JSON object with the following selectors:
            - searchInputSelector: CSS selector for search input
            - resultsSelector: CSS selector for search results container
            
            HTML Content:
            ${pageContent}`;

            const result = await this.retryWithBackoff(async () => {
                const response = await this.model.generateContent(prompt);
                return response;
            });
            
            const response = await result.response;
            const text = response.text();
            
            // Extract JSON from the response
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('Failed to extract JSON from Gemini response');
            }
            
            const analysis = JSON.parse(jsonMatch[0]);
            logger.info('Search form analysis completed');
            return analysis;
        } catch (error) {
            logger.error('Failed to analyze search form:', error);
            throw error;
        }
    }

    async extractEntities(text) {
        try {
            const prompt = `Extract named entities from the following text. 
            Return a JSON array of objects with 'text' and 'type' properties.
            
            Text:
            ${text}`;

            const result = await this.retryWithBackoff(async () => {
                const response = await this.model.generateContent(prompt);
                return response;
            });
            
            const response = await result.response;
            const responseText = response.text();
            
            // Extract JSON from the response
            const jsonMatch = responseText.match(/\[[\s\S]*\]/);
            if (!jsonMatch) {
                throw new Error('Failed to extract JSON from Gemini response');
            }
            
            const entities = JSON.parse(jsonMatch[0]);
            logger.info('Entity extraction completed');
            return entities;
        } catch (error) {
            logger.error('Failed to extract entities:', error);
            throw error;
        }
    }

    async classifyContent(content) {
        try {
            const prompt = `Classify the following content into categories.
            Return a JSON object with 'categories' array and 'confidence' scores.
            
            Content:
            ${content}`;

            const result = await this.retryWithBackoff(async () => {
                const response = await this.model.generateContent(prompt);
                return response;
            });
            
            const response = await result.response;
            const text = response.text();
            
            // Extract JSON from the response
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('Failed to extract JSON from Gemini response');
            }
            
            const classification = JSON.parse(jsonMatch[0]);
            logger.info('Content classification completed');
            return classification;
        } catch (error) {
            logger.error('Failed to classify content:', error);
            throw error;
        }
    }
}

module.exports = { NLPProcessor }; 