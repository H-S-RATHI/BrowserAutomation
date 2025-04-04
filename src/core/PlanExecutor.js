const { logger } = require('../utils/logger');
const { 
    handleNavigate,
    handleSearch,
    handleClick, 
    handleType,
    handleExtract, 
    handleWait,
    handleScroll
} = require('./actions');

/**
 * PlanExecutor class that delegates actions to individual handler functions
 */
class PlanExecutor {
    /**
     * Creates a new PlanExecutor
     * @param {Object} browserAutomation - The browser automation instance
     * @param {Object} nlpProcessor - The NLP processor instance
     */
    constructor(browserAutomation, nlpProcessor) {
        this.browserAutomation = browserAutomation;
        this.nlpProcessor = nlpProcessor;
    }

    /**
     * Executes an automation plan by delegating to action handlers based on step type
     * @param {Object} plan - The automation plan to execute
     * @returns {Object} The executed plan with results
     */
    async executePlan(plan) {
        try {
            // Create context object to pass to handlers
            const context = {
                browserAutomation: this.browserAutomation,
                nlpProcessor: this.nlpProcessor
            };

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
                
                // Delegate to the appropriate action handler based on the action type
                switch (step.action) {
                    case 'navigate':
                        await handleNavigate(step, context);
                        break;
                        
                    case 'search':
                        await handleSearch(step, context);
                        break;
                        
                    case 'click':
                        await handleClick(step, context);
                        break;
                        
                    case 'type':
                        await handleType(step, context);
                        break;
                        
                    case 'extract':
                        await handleExtract(step, context);
                        break;
                        
                    case 'wait':
                        await handleWait(step, context);
                        break;
                        
                    case 'scroll':
                        await handleScroll(step, context);
                        break;
                        
                    default:
                        logger.warn(`Unknown action type: ${step.action}`);
                        throw new Error(`Unsupported action: ${step.action}`);
                }
                
                logger.info(`Completed step: ${step.description}`);
            }
            
            return plan;
        } catch (error) {
            logger.error('Error executing plan:', error);
            throw error;
        }
    }
}

module.exports = { PlanExecutor };
