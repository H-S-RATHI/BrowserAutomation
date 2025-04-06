const { logger } = require('../../utils/logger');

/**
 * Handles the 'pressEnter' action by simulating an Enter key press
 * @param {Object} step - The step to execute
 * @param {Object} context - The execution context containing browserAutomation instance
 * @returns {Object} The updated step object
 */
async function handlePressEnter(step, context) {
    const { browserAutomation } = context;

    if (!step.sessionId) {
        throw new Error('Session ID required for pressEnter action');
    }

    try {
        logger.info('Pressing Enter key...');

        // First dispatch keyDown event
        await browserAutomation.sendCommand('Input.dispatchKeyEvent', {
            type: 'keyDown',
            key: 'Enter',
            code: 'Enter',
            windowsVirtualKeyCode: 13,
            nativeVirtualKeyCode: 13,
            text: '\r',
            unmodifiedText: '\r',
            isKeypad: false,
            modifiers: 0
        }, step.sessionId);

        // Small delay between keyDown and keyUp
        await new Promise(resolve => setTimeout(resolve, 100));

        // Then dispatch keyUp event to complete the key press
        await browserAutomation.sendCommand('Input.dispatchKeyEvent', {
            type: 'keyUp',
            key: 'Enter',
            code: 'Enter',
            windowsVirtualKeyCode: 13,
            nativeVirtualKeyCode: 13,
            isKeypad: false,
            modifiers: 0
        }, step.sessionId);

        // Also dispatch keypress event via JavaScript
        await browserAutomation.sendCommand('Runtime.evaluate', {
            expression: `
                (() => {
                    try {
                        // Dispatch keypress event
                        const keypressEvent = new KeyboardEvent('keypress', {
                            key: 'Enter',
                            code: 'Enter',
                            keyCode: 13,
                            which: 13,
                            bubbles: true,
                            cancelable: true
                        });
                        document.dispatchEvent(keypressEvent);
                        
                        // Try to submit any active form
                        const activeElement = document.activeElement;
                        if (activeElement && activeElement.form) {
                            activeElement.form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
                            try {
                                activeElement.form.submit();
                            } catch (e) {
                                console.error("Form submit error:", e);
                            }
                        }
                        
                        return true;
                    } catch (e) {
                        console.error("Error pressing Enter via JavaScript:", e);
                        return false;
                    }
                })()
            `,
            returnByValue: true
        }, step.sessionId);

        logger.info('Enter key pressed successfully');
        return step;
    } catch (error) {
        logger.error(`Error pressing Enter key: ${error.message}`);
        // Try a fallback method using Input.insertText with a newline character
        try {
            logger.info('Trying fallback method for Enter key press');
            await browserAutomation.sendCommand('Input.insertText', {
                text: '\n'
            }, step.sessionId);
        } catch (fallbackError) {
            logger.error(`Fallback Enter key method also failed: ${fallbackError.message}`);
        }
        throw error;
    }
}

module.exports = { handlePressEnter };
