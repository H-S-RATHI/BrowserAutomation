//BrowserAutomation.js
const WebSocket = require('ws');
const { logger } = require('../utils/logger');
const { spawn } = require('child_process');
const http = require('http');
const net = require('net');
const fs = require('fs');
const path = require('path');

class BrowserAutomation {
    constructor(options = {}) {
        this.options = {
            browser: options.browser || 'chrome',
            headless: options.headless || false,
            proxy: options.proxy || null,
            extensions: options.extensions || [],
            debugPort: options.debugPort || null, // Will be set dynamically
            ...options
        };
        this.ws = null;
        this.messageId = 0;
        this.browserProcess = null;
        this.pendingCommands = new Map();
        
        // Use the default Chrome profile directory
        if (process.platform === 'win32') {
            this.userDataDir = path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'User Data');
        } else if (process.platform === 'darwin') {
            this.userDataDir = path.join(process.env.HOME, 'Library', 'Application Support', 'Google', 'Chrome');
        } else {
            this.userDataDir = path.join(process.env.HOME, '.config', 'google-chrome');
        }
    }

    async initialize() {
        try {
            // Find an available port
            this.options.debugPort = await this.findAvailablePort();
            logger.info(`Using debug port: ${this.options.debugPort}`);

            // Start browser with remote debugging enabled
            await this.startBrowserWithDebugging();

            // Wait for the debugging port to be available
            await this.waitForDebuggingPort();

            // Connect to browser's debugging protocol
            await this.connectToBrowser();

            logger.info('Browser automation initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize browser automation:', error);
            throw error;
        }
    }

    async findAvailablePort(startPort = 3000) {
        return new Promise((resolve, reject) => {
            const server = net.createServer();
            server.unref();
            server.on('error', () => {
                // Port is in use, try the next one
                resolve(this.findAvailablePort(startPort + 1));
            });
            server.listen(startPort, () => {
                server.close(() => {
                    resolve(startPort);
                });
            });
        });
    }

    async startBrowserWithDebugging() {
        // Find Chrome executable
        let browserPath;
        if (this.options.browser === 'chrome') {
            // Common Chrome paths on Windows
            const possiblePaths = [
                'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
                'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
                process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
                process.env.PROGRAMFILES + '\\Google\\Chrome\\Application\\chrome.exe',
                process.env['PROGRAMFILES(X86)'] + '\\Google\\Chrome\\Application\\chrome.exe'
            ];
            
            for (const path of possiblePaths) {
                try {
                    if (fs.existsSync(path)) {
                        browserPath = path;
                        break;
                    }
                } catch (e) {
                    // Path doesn't exist, continue to next
                }
            }
            
            if (!browserPath) {
                throw new Error('Chrome executable not found. Please specify the path manually.');
            }
        } else {
            throw new Error(`Unsupported browser: ${this.options.browser}`);
        }

        // Arguments to use the temporary profile
        const args = [
            `--remote-debugging-port=${this.options.debugPort}`,
            '--no-first-run',
            '--no-default-browser-check'
        ];

        if (this.options.headless) {
            args.push('--headless=new');
        }

        if (this.options.proxy) {
            args.push(`--proxy-server=${this.options.proxy.server}`);
        }

        return new Promise((resolve, reject) => {
            logger.info(`Starting browser: ${browserPath}`);
            logger.debug(`Browser arguments: ${args.join(' ')}`);
            
            this.browserProcess = spawn(browserPath, args, {
                stdio: 'ignore'
            });
            
            this.browserProcess.on('error', (error) => {
                logger.error('Failed to start browser:', error);
                reject(error);
            });

            // Give the browser a moment to start
            setTimeout(resolve, 2000);
        });
    }

    async waitForDebuggingPort() {
        return new Promise((resolve, reject) => {
            const maxAttempts = 30;
            const timeout = 500;
            let attempts = 0;
            const debugPort = this.options.debugPort;
            
            const checkPort = () => {
                attempts++;
                logger.debug(`Checking debugging port, attempt ${attempts}/${maxAttempts}`);
                
                const req = http.get(`http://localhost:${debugPort}/json/version`, (res) => {
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => {
                        if (res.statusCode === 200) {
                            try {
                                const version = JSON.parse(data);
                                logger.info(`Connected to ${version.Browser}`);
                                resolve();
                            } catch (e) {
                                retry();
                            }
                        } else {
                            retry();
                        }
                    });
                });
                
                req.on('error', retry);
                req.setTimeout(timeout, () => {
                    req.destroy();
                    retry();
                });

                function retry() {
                    if (attempts < maxAttempts) {
                        setTimeout(checkPort, timeout);
                    } else {
                        reject(new Error(`Debugging port ${debugPort} not available after ${maxAttempts} attempts`));
                    }
                }
            };
            
            checkPort();
        });
    }

    async connectToBrowser() {
        return new Promise((resolve, reject) => {
            // First, get the WebSocket URL from the debugging protocol
            http.get(`http://localhost:${this.options.debugPort}/json/version`, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        try {
                            const version = JSON.parse(data);
                            const wsUrl = version.webSocketDebuggerUrl;
                            logger.info(`WebSocket URL: ${wsUrl}`);
                            
                            // Connect to the WebSocket URL
                            this.ws = new WebSocket(wsUrl);

                            this.ws.on('open', () => {
                                logger.info('Connected to browser debugging protocol');
                                resolve();
                            });

                            this.ws.on('error', (error) => {
                                logger.error('WebSocket connection error:', error);
                                reject(error);
                            });

                            this.ws.on('message', (data) => {
                                try {
                                    const message = JSON.parse(data);
                                    this.handleBrowserMessage(message);
                                } catch (error) {
                                    logger.error('Failed to parse browser message:', error);
                                }
                            });

                            this.ws.on('close', () => {
                                logger.info('WebSocket connection closed');
                            });
                        } catch (error) {
                            logger.error('Failed to parse version response:', error);
                            reject(error);
                        }
                    } else {
                        logger.error(`Failed to get WebSocket URL, status code: ${res.statusCode}`);
                        reject(new Error(`Failed to get WebSocket URL, status code: ${res.statusCode}`));
                    }
                });
            }).on('error', (error) => {
                logger.error('Failed to connect to debugging protocol:', error);
                reject(error);
            });
        });
    }

    // Modified to handle sessionId properly
    async sendCommand(method, params = {}, sessionId = null) {
        return new Promise((resolve, reject) => {
            const id = ++this.messageId;
            let message = {
                id,
                method,
                params
            };

            // If sessionId is provided, include it in the message
            if (sessionId) {
                message.sessionId = sessionId;
            }

            this.ws.send(JSON.stringify(message), (error) => {
                if (error) {
                    reject(error);
                }
            });

            // Store the resolver in the pendingCommands Map
            this.pendingCommands.set(id, resolve);
        });
    }

    handleBrowserMessage(message) {
        if (message.id && this.pendingCommands.has(message.id)) {
            const resolve = this.pendingCommands.get(message.id);
            this.pendingCommands.delete(message.id);
            
            // Return the full message object with result property
            resolve({ result: message.result });
        }
    }
    
    async fillFormField(selector, value, sessionId = null) {
        try {
            // First focus the element
            await this.sendCommand('Runtime.evaluate', {
                expression: `document.querySelector('${selector}').focus()`
            }, sessionId);
            
            // Then set its value 
            await this.sendCommand('Runtime.evaluate', {
                expression: `document.querySelector('${selector}').value = '${value}'`
            }, sessionId);
            
            return true;
        } catch (error) {
            logger.error(`Failed to fill form field ${selector}:`, error);
            throw error;
        }
    }

    async close() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }

        if (this.browserProcess) {
            try {
                this.browserProcess.kill();
            } catch (error) {
                logger.error('Error killing browser process:', error);
            }
            this.browserProcess = null;
        }

        logger.info('Browser automation closed successfully');
    }
}

module.exports = { BrowserAutomation };