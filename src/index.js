require('dotenv').config();
const express = require('express');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { BrowserAutomation } = require('./core/BrowserAutomation');
const { logger } = require('./utils/logger');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Retry configuration
const retryDelay = 1000; // 1 second
const maxRetries = 3;

// Global browser automation instance
let browserAutomation = null;

async function retryWithBackoff(operation) {
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

// Process natural language commands
async function processCommand(command) {
    try {
        // Ask Gemini to parse the command
        const prompt = `You are a browser automation expert. Convert natural language commands into structured actions.
        Return JSON in this format:
        {
            "action": "navigate|search|login",
            "url": "the target URL",
            "params": { additional parameters }
        }
        
        Command: ${command}`;
        
        const result = await retryWithBackoff(async () => {
            const response = await model.generateContent(prompt);
            return response;
        });
        
        const response = await result.response;
        const text = response.text();
        
        // Extract JSON from the response
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('Failed to extract JSON from Gemini response');
        }
        
        const parsedCommand = JSON.parse(jsonMatch[0]);
        return parsedCommand;
    } catch (error) {
        logger.error('Failed to process command:', error);
        throw error;
    }
}

// Handle browser automation commands
app.post('/api/execute', async (req, res) => {
    const { command } = req.body;

    try {
        // Process the natural language command
        const parsedCommand = await processCommand(command);
        logger.info('Parsed command:', parsedCommand);

        // Ensure browser automation is initialized
        if (!browserAutomation) {
            browserAutomation = new BrowserAutomation({
                headless: false,
                browser: 'chrome'
            });
            await browserAutomation.initialize();
        }

        // Create a new tab
        const createTargetResponse = await browserAutomation.sendCommand('Target.createTarget', {
            url: 'about:blank'
        });
        
        // Fix: Properly extract targetId from the response
        const targetId = createTargetResponse.result.targetId;
        
        if (!targetId) {
            throw new Error('Failed to create new browser tab');
        }

        // Execute the command in the new tab
        switch (parsedCommand.action) {
            case 'navigate':
                await browserAutomation.sendCommand('Page.navigate', { 
                    url: parsedCommand.url,
                    targetId: targetId
                });
                // Wait for navigation to complete
                await new Promise(resolve => setTimeout(resolve, 2000));
                break;

            case 'search':
                await browserAutomation.sendCommand('Page.navigate', { 
                    url: 'https://www.google.com',
                    targetId: targetId
                });
                // Wait for navigation to complete
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                // Type search query
                await browserAutomation.fillFormField('input[name="q"]', parsedCommand.params.query, targetId);
                
                // Press Enter
                await browserAutomation.sendCommand('Input.dispatchKeyEvent', {
                    type: 'keyDown',
                    key: 'Enter',
                    targetId: targetId
                });
                
                // Wait for results
                await new Promise(resolve => setTimeout(resolve, 2000));
                break;

            default:
                throw new Error(`Unknown action: ${parsedCommand.action}`);
        }

        res.json({
            success: true,
            message: 'Command executed successfully',
            data: parsedCommand
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
        logger.info('Browser automation initialized successfully');
        
        // Navigate to a default page
        await browserAutomation.sendCommand('Page.navigate', { url: 'https://www.google.com' });
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        logger.info('Navigated to default page');
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