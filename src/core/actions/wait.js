const { logger } = require('../../utils/logger');

/**
 * Handles the 'wait' action by pausing execution for a specified duration
 * @param {Object} step - The step to execute
 * @param {Object} context - The execution context
 * @returns {Object} The step object
 */
async function handleWait(step, context) {
    const duration = step.params.duration || 2000;
    logger.info(`Waiting for ${duration}ms...`);
    
    await new Promise(resolve => setTimeout(resolve, duration));
    logger.info('Wait completed');
    
    return step;
}

module.exports = { handleWait };
