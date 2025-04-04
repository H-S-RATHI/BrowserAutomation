const { logger } = require('../../utils/logger');

/**
 * Handles the 'navigate' action by creating a new tab and navigating to a URL
 * @param {Object} step - The step to execute
 * @param {Object} context - The execution context containing browserAutomation instance and other utilities
 * @returns {Object} The updated step object with sessionId
 */
async function handleNavigate(step, context) {
    const { browserAutomation } = context;

    // Create a new tab
    const createTargetResponse = await browserAutomation.sendCommand('Target.createTarget', {
        url: 'about:blank'
    });
    
    const targetId = createTargetResponse.result.targetId;
    if (!targetId) {
        throw new Error('Failed to create new browser tab');
    }

    logger.info(`Created new tab with targetId: ${targetId}`);

    // Attach to the new target
    const attachResponse = await browserAutomation.sendCommand('Target.attachToTarget', {
        targetId: targetId,
        flatten: true
    });

    if (!attachResponse.result.sessionId) {
        throw new Error('Failed to attach to target');
    }

    const sessionId = attachResponse.result.sessionId;
    logger.info(`Attached to target with sessionId: ${sessionId}`);

    // Enable page events
    await browserAutomation.sendCommand('Page.enable', {}, sessionId);
    await browserAutomation.sendCommand('DOM.enable', {}, sessionId);
    await browserAutomation.sendCommand('Runtime.enable', {}, sessionId);
    await browserAutomation.sendCommand('Network.enable', {}, sessionId);

    // Navigation event listeners
    await browserAutomation.sendCommand('Page.setLifecycleEventsEnabled', { 
        enabled: true 
    }, sessionId);

    // Navigate to the URL
    logger.info(`Navigating to URL: ${step.params.url}`);
    await browserAutomation.sendCommand('Page.navigate', { 
        url: step.params.url
    }, sessionId);

    // Wait for navigation to complete and page to be interactive
    logger.info('Waiting for page to load completely...');
    
    // Initial wait to allow page to start loading
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Wait for DOM content to be loaded
    await browserAutomation.sendCommand('Runtime.evaluate', {
        expression: `
            new Promise((resolve) => {
                if (document.readyState === 'complete') {
                    resolve();
                } else {
                    window.addEventListener('load', resolve);
                }
            })
        `,
        awaitPromise: true
    }, sessionId);
    
    // Additional wait for any JavaScript to initialize
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    logger.info(`Navigation completed to: ${step.params.url}`);

    // Store session ID for subsequent steps
    step.sessionId = sessionId;
    
    return step;
}

module.exports = { handleNavigate };
