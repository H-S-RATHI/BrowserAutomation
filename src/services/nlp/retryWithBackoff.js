const { logger } = require('../../utils/logger');

/**
 * Retries an operation with exponential backoff, especially useful for rate-limited API calls
 * @param {Function} operation - Async function to execute and potentially retry
 * @param {number} maxRetries - Maximum number of retry attempts
 * @param {number} retryDelay - Base delay in milliseconds between retries
 * @returns {Promise<any>} - Result of the operation when successful
 */
async function retryWithBackoff(operation, maxRetries = 3, retryDelay = 1000) {
    let lastError;
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            if (error.message.includes('429') || error.message.includes('Rate limit')) {
                const delay = retryDelay * Math.pow(2, i);
                logger.warn(`Rate limit hit, retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
            throw error;
        }
    }
    throw lastError;
}

module.exports = { retryWithBackoff };
