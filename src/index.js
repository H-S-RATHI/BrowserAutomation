//index.js
require('dotenv').config();
const express = require('express');
const path = require('path');
const { BrowserAutomation } = require('./core/BrowserAutomation');
const { NLPProcessor } = require('./services/NLPProcessor');
const PlanExecutor = require('./core/PlanExecutor');
const { logger } = require('./utils/logger');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Initialize NLP processor
const nlpProcessor = new NLPProcessor(process.env.GEMINI_API_KEY);

// Global browser automation instance
let browserAutomation = null;
let planExecutor = null;

// Handle browser automation commands
app.post('/api/execute', async (req, res) => {
    const { command } = req.body;

    try {
        // Process the natural language command
        const plan = await nlpProcessor.processCommand(command);
        logger.info('Generated automation plan:', JSON.stringify(plan, null, 2));

        // Ensure browser automation is initialized
        if (!browserAutomation) {
            browserAutomation = new BrowserAutomation({
                headless: false,
                browser: 'chrome'
            });
            await browserAutomation.initialize();
            planExecutor = new PlanExecutor(browserAutomation, nlpProcessor);
        }

        // Execute the plan using the PlanExecutor
        const executedPlan = await planExecutor.executePlan(plan);

        res.json({
            success: true,
            message: 'Command executed successfully',
            data: executedPlan
        });
    } catch (error) {
        logger.error('Command execution failed:', error);
        res.status(500).json({
            success: false,
            message: 'Command execution failed',
            error: error.message
        });
    }
});

const port = process.env.PORT || 3000;

// Start the server
app.listen(port, async () => {
    logger.info(`Server running on port ${port}`);
    
    // Initialize browser automation
    try {
        logger.info('Initializing browser automation...');
        browserAutomation = new BrowserAutomation({
            headless: false,
            browser: 'chrome'
        });
        
        await browserAutomation.initialize();
        planExecutor = new PlanExecutor(browserAutomation, nlpProcessor);
        logger.info('Browser automation initialized successfully');
    } catch (error) {
        logger.error('Failed to initialize browser automation:', error);
    }
});

// Handle process termination
process.on('SIGINT', async () => {
    logger.info('Shutting down server...');
    if (browserAutomation) {
        await browserAutomation.close();
    }
    process.exit(0);
});