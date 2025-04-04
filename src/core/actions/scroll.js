const { logger } = require('../../utils/logger');

/**
 * Handles the 'scroll' action by scrolling the page
 * @param {Object} step - The step to execute
 * @param {Object} context - The execution context containing browserAutomation instance
 * @returns {Object} The step object
 */
async function handleScroll(step, context) {
    const { browserAutomation } = context;

    if (!step.sessionId) {
        throw new Error('Session ID required for scroll action');
    }
    
    const direction = step.params.direction || 'down';
    const amount = step.params.amount || 500;
    
    logger.info(`Scrolling ${direction} by ${amount}px`);
    
    let scrollScript = '';
    if (direction === 'down') {
        scrollScript = `window.scrollBy(0, ${amount});`;
    } else if (direction === 'up') {
        scrollScript = `window.scrollBy(0, -${amount});`;
    } else if (direction === 'right') {
        scrollScript = `window.scrollBy(${amount}, 0);`;
    } else if (direction === 'left') {
        scrollScript = `window.scrollBy(-${amount}, 0);`;
    } else if (direction === 'bottom') {
        scrollScript = 'window.scrollTo(0, document.body.scrollHeight);';
    } else if (direction === 'top') {
        scrollScript = 'window.scrollTo(0, 0);';
    }
    
    // Execute the scroll
    await browserAutomation.sendCommand('Runtime.evaluate', {
        expression: scrollScript
    }, step.sessionId);
    
    // Allow some time for the scroll to complete and for any lazy-loaded content
    await new Promise(resolve => setTimeout(resolve, 500));
    
    logger.info('Scroll action completed');
    return step;
}

module.exports = { handleScroll };
