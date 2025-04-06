const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const url = require('url');

/**
 * Extreme HTML simplifier for XPath analysis
 * @param {string} html - Raw HTML content
 * @returns {string} - Minimized HTML with only structural elements
 */
function cleanHtml(html) {
    if (!html) return '';
    
    try {
        const $ = cheerio.load(html, { decodeEntities: false });
        
        // Remove elements that don't contribute to DOM structure
        const toRemove = [
            'script', 'style', 'link', 'meta', 
            'svg', 'canvas', 'video', 'audio',
            'iframe', 'noscript', 'picture', 'source',
            'embed', 'object', 'param', 'track',
            'map', 'area', 'applet', 'basefont', 'font',
           'marquee', 'blink', 'nobr', 'wbr', 'xmp',
           'tt', 'big', 'small', 'strike', 'center',
           'blockquote', 'q', 'cite', 'dfn', 'abbr',
           'data', 'time', 'code', 'var', 'samp',
           'kbd', 'tt', 'i', 'b', 'u', 's', 'em', 'strong',
           'dfn', 'cite', 'address', 'pre', 'plaintext',
        ];
        $(toRemove.join(',')).remove();

        // Process remaining elements
        $('*').each(function() {
            const $el = $(this);
            
            // Keep only critical attributes
            const allowedAttrs = ['id', 'class', 'name', 'type', 'href'];
            Object.keys(this.attribs).forEach(attr => {
                if (!allowedAttrs.includes(attr)) {
                    $el.removeAttr(attr);
                } else if (attr === 'href') {
                    const href = $el.attr('href');
                    if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
                        try {
                            const parsedUrl = new URL(href, 'http://example.com');
                            // Remove query parameters and hash
                            parsedUrl.search = '';
                            parsedUrl.hash = '';
                            // Keep only hostname and pathname
                            const shortUrl = parsedUrl.hostname + parsedUrl.pathname;
                            $el.attr('href', shortUrl);
                        } catch (e) {
                            // If URL parsing fails, keep original href
                        }
                    }
                }
            });

            // Simplify text nodes (preserve whitespace structure)
            $el.contents().filter(function() {
                return this.type === 'text';
            }).each(function() {
                const text = $(this).text()
                    .replace(/\s+/g, ' ')
                    .trim();
                $(this).replaceWith(text);
            });
        });

        // Remove empty containers (preserve form elements)
        let removed;
        do {
            removed = 0;
            $('body *').each(function() {
                const $el = $(this);
                if (
                    !$el.children().length &&
                    !$el.text() &&
                    !['input', 'img', 'br', 'hr'].includes(this.tagName.toLowerCase())
                ) {
                    $el.remove();
                    removed++;
                }
            });
        } while (removed > 0);

        // Generate minimized HTML
        const minimized = $('body').html()
            .replace(/>\s+</g, '><')  // Remove whitespace between tags
            .replace(/\s{2,}/g, ' ')   // Collapse multiple spaces
            .trim();

        saveResult(minimized);
        return minimized;
    } catch (error) {
        console.error(`Error simplifying HTML: ${error.message}`);
        return html;
    }
}

/**
 * Save minimized HTML
 * @param {string} content - Minimized HTML content
 */
function saveResult(content) {
    const outputDir = path.join(process.cwd(), 'xpath_html');
    const outputPath = path.join(outputDir, `minimized_${Date.now()}.html`);
    
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    
    fs.writeFileSync(outputPath, content);
    console.log(`XPath-ready HTML saved to: ${outputPath}`);
}

module.exports = { cleanHtml };