const { GoogleGenerativeAI } = require('@google/generative-ai');
const {
    retryWithBackoff,
    processCommand,
    findElementSelector,
    extractDataFromPage,
} = require('./nlp');

/**
 * NLPProcessor class that handles natural language processing of commands
 * by delegating to specialized functions
 */
class NLPProcessor {
    /**
     * Creates a new NLPProcessor with the given API key
     * @param {string} apiKey - The Gemini API key
     */
    constructor(apiKey) {
        this.genAI = new GoogleGenerativeAI(apiKey);
        this.model = this.genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
        this.retryDelay = 1000; // 1 second
        this.maxRetries = 3;
    }

    /**
     * Processes a natural language command into an automation plan
     * @param {string} command - The natural language command to process
     * @returns {Object} - The structured automation plan
     */
    async processCommand(command) {
        return processCommand(command, this.model);
    }

    /**
     * Finds a CSS selector for an element described in natural language
     * @param {string} pageHtml - The HTML content of the page
     * @param {string} elementDescription - Natural language description of the element to find
     * @returns {Object} - Object containing the selector and possibly a submit selector
     */
    async findElementSelector(pageHtml, elementDescription) {
        return findElementSelector(pageHtml, elementDescription, this.model);
    }

    /**
     * Extracts structured data from a webpage based on instructions
     * @param {string} pageHtml - The HTML content of the page
     * @param {string} extractionInstructions - Instructions on what data to extract
     * @returns {Object} - Extracted data in structured format
     */
    async extractDataFromPage(pageHtml, extractionInstructions) {
        return extractDataFromPage(pageHtml, extractionInstructions, this.model);
    }

    /**
     * Retries an operation with exponential backoff, especially useful for rate-limited API calls
     * @param {Function} operation - Async function to execute and potentially retry
     * @returns {Promise<any>} - Result of the operation when successful
     */
    async retryWithBackoff(operation) {
        return retryWithBackoff(operation, this.maxRetries, this.retryDelay);
    }
}

module.exports = { NLPProcessor };
