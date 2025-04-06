const { logger } = require('../utils/logger');
const { handleNavigate } = require('./actions/navigate');
const { handleSearch } = require('./actions/search');
const { handleClick } = require('./actions/click');
const { handleType } = require('./actions/type');
const { handleExtract } = require('./actions/extract');
const { handleWait } = require('./actions/wait');
const { handleScroll } = require('./actions/scroll');
const { handleSelectorFinder } = require('./actions/selectorFinder');
const { handlePressEnter } = require('./actions/pressEnter');

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
     * Executes an automation plan
     * @param {Object} plan - The automation plan to execute
     * @returns {Object} - The execution results
     */
    async executePlan(plan) {
        logger.info('Generated automation plan:');
        logger.info(JSON.stringify(plan, null, 2));

        const results = [];
        let sessionId = null;
        let targetId = null;

        // Execute each step in the plan
        for (const step of plan.steps) {
            try {
                logger.info(`Executing step: ${step.description}`);

                // Reuse the same session for all steps if available
                if (sessionId) {
                    logger.info(`Using previous step's sessionId: ${sessionId}`);
                    step.sessionId = sessionId;
                }

                // Reuse the same target for all steps if available
                if (targetId) {
                    step.targetId = targetId;
                }

                // Create context object with dependencies
                const context = {
                    browserAutomation: this.browserAutomation,
                    nlpProcessor: this.nlpProcessor
                };

                // Execute the appropriate action based on the step type
                let updatedStep;
                switch (step.action) {
                    case 'navigate':
                        updatedStep = await handleNavigate(step, context);
                        break;
                    case 'search':
                        updatedStep = await handleSearch(step, context);
                        break;
                    case 'click':
                        // Add description if missing for click action
                        if (!step.params.description && step.description) {
                            step.params.description = step.description;
                        }
                        updatedStep = await handleClick(step, context);
                        break;
                    case 'type':
                        // Add description if missing for type action
                        if (!step.params.description && step.description) {
                            step.params.description = step.description;
                        }
                        updatedStep = await handleType(step, context);
                        break;
                    case 'extract':
                        updatedStep = await handleExtract(step, context);
                        break;
                    case 'wait':
                        updatedStep = await handleWait(step, context);
                        break;
                    case 'scroll':
                        updatedStep = await handleScroll(step, context);
                        break;
                    case 'findSelector':
                        // Add description if missing for findSelector action
                        if (!step.params.description && step.description) {
                            step.params.description = step.description;
                        }
                        updatedStep = await handleSelectorFinder(step, context);
                        break;
                    case 'pressEnter':
                        // Add description if missing for pressEnter action
                        if (!step.params.description && step.description) {
                            step.params.description = step.description;
                        }
                        updatedStep = await handlePressEnter(step, context);
                        break;
                    default:
                        throw new Error(`Unknown action type: ${step.action}`);
                }

                // Store the session ID for subsequent steps
                if (updatedStep.sessionId && !sessionId) {
                    sessionId = updatedStep.sessionId;
                }

                // Store the target ID for subsequent steps
                if (updatedStep.targetId && !targetId) {
                    targetId = updatedStep.targetId;
                }

                results.push(updatedStep);
                logger.info(`Completed step: ${step.description}`);
            } catch (error) {
                logger.error(`Error executing step "${step.description}": ${error.message}`);
                step.error = error.message;
                results.push(step);
                break;
            }
        }

        return {
            task: plan.task,
            steps: results
        };
    }
}

module.exports = PlanExecutor;
