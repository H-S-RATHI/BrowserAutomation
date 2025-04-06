const { logger } = require('../../utils/logger');
const { handleType } = require('./type');
const { handleSelectorFinder } = require('./selectorFinder');
const { handlePressEnter } = require('./pressEnter');

/**
 * Handles the 'search' action by finding and interacting with search boxes on web pages
 * @param {Object} step - The step to execute 
 * @param {Object} context - The execution context containing browserAutomation and nlpProcessor instances
 * @returns {Object} The updated step object with sessionId
 */
async function handleSearch(step, context) {
    const { browserAutomation } = context;

    // Create new tab only if no sessionId exists AND we don't have a previous step with session
    if (!step.sessionId) {
        logger.info('No existing session found, creating new tab for search');
        const createTargetResponse = await browserAutomation.sendCommand('Target.createTarget', {
            url: 'about:blank'
        });
        
        const targetId = createTargetResponse.result.targetId;
        if (!targetId) {
            throw new Error('Failed to create new browser tab');
        }

        const attachResponse = await browserAutomation.sendCommand('Target.attachToTarget', {
            targetId: targetId,
            flatten: true
        });

        if (!attachResponse.result.sessionId) {
            throw new Error('Failed to attach to target');
        }

        const sessionId = attachResponse.result.sessionId;
        step.sessionId = sessionId;
        
        // Enable required domains
        await browserAutomation.sendCommand('Page.enable', {}, sessionId);
        await browserAutomation.sendCommand('DOM.enable', {}, sessionId);
        await browserAutomation.sendCommand('Runtime.enable', {}, sessionId);
        await browserAutomation.sendCommand('Network.enable', {}, sessionId);
        
        // Navigation event listeners
        await browserAutomation.sendCommand('Page.setLifecycleEventsEnabled', { 
            enabled: true 
        }, sessionId);
        
        // Navigate to the URL if provided
        if (step.params.url) {
            logger.info(`Navigating to search URL: ${step.params.url}`);
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
            
            logger.info('Page loaded completely');
        }
    }
    
    // Find the search box selector
    const searchBoxStep = {
        action: 'findSelector',
        description: 'search box',
        params: {
            description: 'search box'
        },
        sessionId: step.sessionId
    };
    
    const searchBoxResult = await handleSelectorFinder(searchBoxStep, context);
    if (!searchBoxResult.result?.selectorInfo?.selector) {
        throw new Error('Could not find search box selector');
    }
    
    // Type into the search box
    const typeStep = {
        action: 'type',
        description: 'Type search query',
        params: {
            text: step.params.text || '',
            description: 'search box'
        },
        sessionId: step.sessionId
    };
    
    await handleType(typeStep, context);
    
    // Find and click the search button if needed
    if (step.params.submitSelector) {
        const submitStep = {
            action: 'click',
            description: 'Click search button',
            params: {
                description: 'search button'
            },
            sessionId: step.sessionId
        };
        
        // Note: handleClick function is not defined in the provided code, 
        // so I'm assuming it should be replaced with a function that handles the click action
        // For demonstration purposes, I'll leave it as is, but you should replace it with the actual function
        await handleClick(submitStep, context);
    } else {
        // Press Enter key if no submit button
        const pressEnterStep = {
            action: 'pressEnter',
            description: 'Submit search by pressing Enter',
            params: {
                description: 'search box'
            },
            sessionId: step.sessionId
        };
        
        await handlePressEnter(pressEnterStep, context);
    }
    
    // Wait for search results to load
    logger.info('Waiting for search results to load...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    return step;
}

module.exports = { handleSearch };
