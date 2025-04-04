const { logger } = require('../../utils/logger');

/**
 * Cleans HTML content to reduce size and noise before sending to AI models
 * @param {string} html - The raw HTML content to clean
 * @returns {string} - The cleaned HTML content
 */
function cleanHtml(html) {
    // Remove script and style tags to reduce size and noise
    let cleanedHtml = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    cleanedHtml = cleanedHtml.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
    
    // Remove comments
    cleanedHtml = cleanedHtml.replace(/<!--[\s\S]*?-->/g, '');
    
    // Truncate the HTML if it's too large (keeping important parts like form elements)
    if (cleanedHtml.length > 50000) {
        // Extract body or main content area
        const bodyMatch = cleanedHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
        if (bodyMatch && bodyMatch[1]) {
            cleanedHtml = bodyMatch[1];
        }
        
        // Further truncate if still too large, but keep forms, inputs, buttons
        if (cleanedHtml.length > 50000) {
            // Extract all forms
            const forms = [];
            const formRegex = /<form[^>]*>[\s\S]*?<\/form>/gi;
            let formMatch;
            while ((formMatch = formRegex.exec(cleanedHtml)) !== null) {
                forms.push(formMatch[0]);
            }
            
            // Extract important elements
            const importantElements = [];
            const elementRegex = /<(input|button|a|select|textarea)[^>]*>[\s\S]*?(?:<\/\1>|\/?>)/gi;
            let elementMatch;
            while ((elementMatch = elementRegex.exec(cleanedHtml)) !== null) {
                importantElements.push(elementMatch[0]);
            }
            
            // Combine them with a sample of the rest
            cleanedHtml = `<div class="important-content">
                ${forms.join('\n')}
                ${importantElements.join('\n')}
                ${cleanedHtml.substring(0, 20000)}...
            </div>`;
        }
    }
    
    return cleanedHtml;
}

module.exports = { cleanHtml };
