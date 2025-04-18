const { logger } = require('../../utils/logger');
const { retryWithBackoff } = require('./retryWithBackoff');
const { GoogleGenerativeAI } = require('@google/generative-ai');

/**
 * Processes a natural language command and converts it to an automation plan
 * @param {string} command - The natural language command to process
 * @returns {Object} - The automation plan
 */
async function processCommand(command) {
    if (!process.env.GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY environment variable is required');
    }

    logger.info(`Processing command: ${command}`);
    
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    
    const prompt = `You are a browser automation assistant. Convert the following natural language command into a structured automation plan.

Create a JSON object with a 'task' field containing a brief description, and a 'steps' array with the detailed steps to complete the task.

Each step should have:
- "action": One of [navigate, search, click, type, extract, wait, scroll, findSelector, pressEnter]
- "description": Human-readable description of this step
- "params": {
    "url": "URL if applicable",
    "text": "Text to type if applicable",
    "description": "Description of the element to interact with",
    "data": "Additional data needed for this step"
}

Important guidelines:
1. For navigation, use the 'navigate' action with a full URL
2. For search actions, use 'search' to handle both search box and submit button
3. For text input, use 'type' to type into form fields
4. For clicking elements, use 'click' with a description of what to click
5. For pressing Enter, use 'pressEnter' when needed
6. For waiting, use 'wait' with a duration in milliseconds
7. For scrolling, use 'scroll' with a description of where to scroll
8. For finding selectors, use 'findSelector' with a description of what element to find

**IMPORTANT**: Generate only the steps that are explicitly requested by the user. If the user only asks to "go to Google and search for New York", do not automatically add data extraction steps.

Example plan structure:
{
  "task": "Search for 'smartphone' on Flipkart",
  "steps": [
    {
      "action": "navigate",
      "description": "Go to Flipkart",
      "params": {
        "url": "https://www.flipkart.com"
      }
    },
    {
      "action": "wait",
      "description": "Wait for page to load",
      "params": {
        "data": 5000
      }
    },
    {
      "action": "findSelector",
      "description": "Find the search input field",
      "params": {
        "description": "Search input field"
      }
    },
    {
      "action": "type",
      "description": "Type 'smartphone' into the search field",
      "params": {
        "text": "smartphone",
        "description": "Search input field"
      }
    },
    {
      "action": "pressEnter",
      "description": "Submit the search query",
      "params": {
        "description": "Search input field"
      }
    }
  ]
}

Now process the command: ${command}`;
        
    const result = await retryWithBackoff(async () => {
        const response = await model.generateContent(prompt);
        return response;
    });
    
    const response = await result.response;
    const text = await response.text();
    logger.info('AI Response:', text);

    // Extract JSON from the response using a regex that captures from { to the final }
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
        logger.error('AI Response:', text);
        throw new Error('Failed to extract JSON from AI response');
    }
    
    try {
        const plan = JSON.parse(jsonMatch[0]);
        logger.info('Parsed plan:', JSON.stringify(plan, null, 2));
        
        // Validate the plan structure
        if (!plan.task || !Array.isArray(plan.steps)) {
            throw new Error('Invalid plan structure: missing task or steps array');
        }
        
        // Ensure each step has the required fields
        plan.steps.forEach((step, index) => {
            if (!step.action) {
                throw new Error(`Step ${index} is missing the 'action' field`);
            }
            if (!step.description) {
                throw new Error(`Step ${index} is missing the 'description' field`);
            }
            if (!step.params) {
                step.params = {};
            }
            
            // Ensure element descriptions are provided for actions that need selectors
            if (['click', 'type', 'search', 'pressEnter'].includes(step.action) && !step.params.description) {
                step.params.description = step.description;
            }
        });
        
        return plan;
    } catch (error) {
        logger.error('Error parsing plan:', error.message);
        logger.error('Raw JSON:', jsonMatch[0]);
        throw new Error(`Failed to parse automation plan: ${error.message}`);
    }
}

module.exports = { processCommand };