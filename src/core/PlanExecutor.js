const { logger } = require('../utils/logger');

class PlanExecutor {
    constructor(browserAutomation, nlpProcessor) {
        this.browserAutomation = browserAutomation;
        this.nlpProcessor = nlpProcessor;
    }

    async executePlan(plan) {
        try {
            // Execute each step of the plan
            for (const step of plan.steps) {
                logger.info(`Executing step: ${step.description}`);
                
                // Use the previous step's sessionId if available
                if (plan.steps.indexOf(step) > 0) {
                    const prevStep = plan.steps[plan.steps.indexOf(step) - 1];
                    if (prevStep.sessionId && !step.sessionId) {
                        step.sessionId = prevStep.sessionId;
                        logger.info(`Using previous step's sessionId: ${step.sessionId}`);
                    }
                }
                
                // Create a new tab for each navigation step
                if (step.action === 'navigate') {
                    const createTargetResponse = await this.browserAutomation.sendCommand('Target.createTarget', {
                        url: 'about:blank'
                    });
                    
                    const targetId = createTargetResponse.result.targetId;
                    if (!targetId) {
                        throw new Error('Failed to create new browser tab');
                    }

                    logger.info(`Created new tab with targetId: ${targetId}`);

                    // Attach to the new target
                    const attachResponse = await this.browserAutomation.sendCommand('Target.attachToTarget', {
                        targetId: targetId,
                        flatten: true
                    });

                    if (!attachResponse.result.sessionId) {
                        throw new Error('Failed to attach to target');
                    }

                    const sessionId = attachResponse.result.sessionId;
                    logger.info(`Attached to target with sessionId: ${sessionId}`);

                    // Enable page events
                    await this.browserAutomation.sendCommand('Page.enable', {}, sessionId);
                    await this.browserAutomation.sendCommand('DOM.enable', {}, sessionId);
                    await this.browserAutomation.sendCommand('Runtime.enable', {}, sessionId);

                    // Navigate to the URL
                    logger.info(`Navigating to URL: ${step.params.url}`);
                    await this.browserAutomation.sendCommand('Page.navigate', { 
                        url: step.params.url
                    }, sessionId);

                    // Wait for navigation to complete
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    logger.info(`Navigation completed to: ${step.params.url}`);

                    // Store session ID for subsequent steps
                    step.sessionId = sessionId;
                }
                // Handle search actions - separated from navigation
                else if (step.action === 'search') {
                    // Create new tab only if no sessionId exists AND we don't have a previous step with session
                    if (!step.sessionId) {
                        logger.info('No existing session found, creating new tab for search');
                        const createTargetResponse = await this.browserAutomation.sendCommand('Target.createTarget', {
                            url: 'about:blank'
                        });
                        
                        const targetId = createTargetResponse.result.targetId;
                        if (!targetId) {
                            throw new Error('Failed to create new browser tab');
                        }

                        const attachResponse = await this.browserAutomation.sendCommand('Target.attachToTarget', {
                            targetId: targetId,
                            flatten: true
                        });

                        if (!attachResponse.result.sessionId) {
                            throw new Error('Failed to attach to target');
                        }

                        const sessionId = attachResponse.result.sessionId;
                        step.sessionId = sessionId;
                        
                        // Enable required domains
                        await this.browserAutomation.sendCommand('Page.enable', {}, sessionId);
                        await this.browserAutomation.sendCommand('DOM.enable', {}, sessionId);
                        await this.browserAutomation.sendCommand('Runtime.enable', {}, sessionId);
                        
                        // Navigate to the URL if provided
                        if (step.params.url) {
                            logger.info(`Navigating to search URL: ${step.params.url}`);
                            await this.browserAutomation.sendCommand('Page.navigate', { 
                                url: step.params.url
                            }, sessionId);
                            
                            // Wait for navigation to complete
                            await new Promise(resolve => setTimeout(resolve, 3000));
                        }
                    }
                    
                    // Get the full HTML of the page
                    const docResult = await this.browserAutomation.sendCommand('DOM.getDocument', {
                        depth: -1
                    }, step.sessionId);
                    
                    const nodeId = docResult.result.root.nodeId;
                    const outerHTMLResult = await this.browserAutomation.sendCommand('DOM.getOuterHTML', {
                        nodeId: nodeId
                    }, step.sessionId);
                    
                    const pageHTML = outerHTMLResult.result.outerHTML;
                    
                    // Use NLP to find the search box selector
                    logger.info('Getting search box selector using AI...');
                    const selectorInfo = await this.nlpProcessor.findElementSelector(
                        pageHTML, 
                        `search box for searching ${step.params.query || 'content'}`
                    );
                    
                    if (!selectorInfo || !selectorInfo.selector) {
                        throw new Error('Could not find search box selector');
                    }
                    
                    // Fill the search box
                    logger.info(`Found search selector: ${selectorInfo.selector}`);
                    const evaluateResult = await this.browserAutomation.sendCommand('Runtime.evaluate', {
                        expression: `document.querySelector('${selectorInfo.selector}').focus()`
                    }, step.sessionId);
                    
                    // Use either query or text parameter (text is the standard in the API plan)
                    const searchText = step.params.text || step.params.query || '';
                    logger.info(`Typing search text: "${searchText}"`);
                    
                    await this.browserAutomation.sendCommand('Input.insertText', {
                        text: searchText
                    }, step.sessionId);
                    
                    // Find and click the search button if needed
                    if (selectorInfo.submitSelector) {
                        logger.info(`Clicking search button: ${selectorInfo.submitSelector}`);
                        await this.browserAutomation.sendCommand('Runtime.evaluate', {
                            expression: `document.querySelector('${selectorInfo.submitSelector}').click()`
                        }, step.sessionId);
                    } else {
                        // Press Enter key if no submit button
                        logger.info('Pressing Enter key to submit search');
                        
                        // First dispatch keyDown event
                        await this.browserAutomation.sendCommand('Input.dispatchKeyEvent', {
                            type: 'keyDown',
                            key: 'Enter',
                            code: 'Enter',
                            windowsVirtualKeyCode: 13
                        }, step.sessionId);
                        
                        // Then dispatch keyUp event to complete the key press
                        await this.browserAutomation.sendCommand('Input.dispatchKeyEvent', {
                            type: 'keyUp',
                            key: 'Enter',
                            code: 'Enter',
                            windowsVirtualKeyCode: 13
                        }, step.sessionId);
                        
                        logger.info('Enter key pressed to submit search');
                    }
                    
                    // Wait for search results to load
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    logger.info('Search completed');
                }
                // Handle click actions with AI-assisted element finding
                else if (step.action === 'click') {
                    if (!step.sessionId) {
                        throw new Error('Session ID required for click action');
                    }
                    
                    // If selector is not provided, use AI to find it
                    if (!step.params.selector && step.params.description) {
                        // Get page HTML
                        const docResult = await this.browserAutomation.sendCommand('DOM.getDocument', {
                            depth: -1
                        }, step.sessionId);
                        
                        const nodeId = docResult.result.root.nodeId;
                        const outerHTMLResult = await this.browserAutomation.sendCommand('DOM.getOuterHTML', {
                            nodeId: nodeId
                        }, step.sessionId);
                        
                        const pageHTML = outerHTMLResult.result.outerHTML;
                        
                        // Use NLP to find the element selector
                        logger.info(`Getting selector for: ${step.params.description}`);
                        const selectorInfo = await this.nlpProcessor.findElementSelector(
                            pageHTML, 
                            step.params.description
                        );
                        
                        if (!selectorInfo || !selectorInfo.selector) {
                            throw new Error(`Could not find selector for: ${step.params.description}`);
                        }
                        
                        step.params.selector = selectorInfo.selector;
                        logger.info(`Found selector: ${step.params.selector}`);
                    }
                    
                    // Click the element using the selector
                    await this.browserAutomation.sendCommand('Runtime.evaluate', {
                        expression: `document.querySelector('${step.params.selector}').click()`
                    }, step.sessionId);
                    
                    logger.info(`Clicked element: ${step.params.selector}`);
                    
                    // Wait a moment after clicking
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
                // Enhanced type action that also uses AI for finding selectors
                else if (step.action === 'type') {
                    if (!step.sessionId) {
                        throw new Error('Session ID required for type action');
                    }
                    
                    // If selector is not provided, use AI to find it
                    if (!step.params.selector && step.params.description) {
                        // Get page HTML
                        const docResult = await this.browserAutomation.sendCommand('DOM.getDocument', {
                            depth: -1
                        }, step.sessionId);
                        
                        const nodeId = docResult.result.root.nodeId;
                        const outerHTMLResult = await this.browserAutomation.sendCommand('DOM.getOuterHTML', {
                            nodeId: nodeId
                        }, step.sessionId);
                        
                        const pageHTML = outerHTMLResult.result.outerHTML;
                        
                        // Use NLP to find the element selector
                        logger.info(`Getting input selector for: ${step.params.description}`);
                        const selectorInfo = await this.nlpProcessor.findElementSelector(
                            pageHTML, 
                            step.params.description
                        );
                        
                        if (!selectorInfo || !selectorInfo.selector) {
                            throw new Error(`Could not find input selector for: ${step.params.description}`);
                        }
                        
                        step.params.selector = selectorInfo.selector;
                        logger.info(`Found input selector: ${step.params.selector}`);
                    }
                    
                    // Type into the element
                    await this.browserAutomation.sendCommand('Runtime.evaluate', {
                        expression: `document.querySelector('${step.params.selector}').focus()`
                    }, step.sessionId);
                    
                    await this.browserAutomation.sendCommand('Input.insertText', {
                        text: step.params.text || ''
                    }, step.sessionId);
                    
                    logger.info(`Typed text into: ${step.params.selector}`);
                }
                else if (step.action === 'wait') {
                    await new Promise(resolve => setTimeout(resolve, step.params.duration || 2000));
                }
                // New extract action to get data from the page
                else if (step.action === 'extract') {
                    if (!step.sessionId) {
                        throw new Error('Session ID required for extract action');
                    }
                    
                    // Get the full HTML of the page
                    const docResult = await this.browserAutomation.sendCommand('DOM.getDocument', {
                        depth: -1
                    }, step.sessionId);
                    
                    const nodeId = docResult.result.root.nodeId;
                    const outerHTMLResult = await this.browserAutomation.sendCommand('DOM.getOuterHTML', {
                        nodeId: nodeId
                    }, step.sessionId);
                    
                    const pageHTML = outerHTMLResult.result.outerHTML;
                    
                    // Extract data using NLP
                    logger.info('Extracting data from page...');
                    const extractedData = await this.nlpProcessor.extractDataFromPage(
                        pageHTML, 
                        step.params.instructions || 'Extract all visible text content'
                    );
                    
                    // Store the extracted data in the step for the response
                    step.extractedData = extractedData;
                    logger.info('Data extraction completed');
                }
            }
            
            return plan;
        } catch (error) {
            logger.error('Error executing plan:', error);
            throw error;
        }
    }
}

module.exports = { PlanExecutor };