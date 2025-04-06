const fs = require('fs').promises;
const path = require('path');
const { logger } = require('../utils/logger');

/**
 * DataStorage service to handle saving and retrieving extracted data
 */
class DataStorage {
    constructor(storageDir = '.data_storage') {
        this.storageDir = path.join(process.cwd(), storageDir);
        this.initStorage();
    }

    /**
     * Initialize the storage directory
     */
    async initStorage() {
        try {
            await fs.mkdir(this.storageDir, { recursive: true });
            logger.info(`Data storage initialized at: ${this.storageDir}`);
        } catch (error) {
            logger.error('Failed to initialize storage:', error);
            throw error;
        }
    }

    /**
     * Generate a unique filename
     * @param {string} type - Type of data (e.g., 'structured_data', 'raw_html')
     * @returns {string} Unique filename
     */
    generateUniqueFilename(type) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const randomId = Math.random().toString(36).substring(2, 8);
        return `${type}_${timestamp}_${randomId}.json`;
    }

    /**
     * Generate a unique filename for the data
     * @param {string} [prefix] - Optional prefix for the filename
     * @returns {string} Unique filename
     */
    generateFilename(prefix = 'extracted_data') {
        return this.generateUniqueFilename(prefix);
    }

    /**
     * Save extracted data to a file
     * @param {Object} data - The data to save
     * @param {string} [filename] - Optional custom filename
     * @returns {Promise<string>} Path to the saved file
     */
    async saveData(data, filename = null) {
        try {
            const filePath = path.join(this.storageDir, filename || this.generateFilename());
            
            // Add metadata
            const dataWithMetadata = {
                timestamp: new Date().toISOString(),
                data
            };

            await fs.writeFile(filePath, JSON.stringify(dataWithMetadata, null, 2));
            logger.info(`Data saved to: ${filePath}`);
            return filePath;
        } catch (error) {
            logger.error('Failed to save data:', error);
            throw error;
        }
    }

    /**
     * Retrieve saved data by filename
     * @param {string} filename - Name of the file to retrieve
     * @returns {Promise<Object>} The saved data
     */
    async getData(filename) {
        try {
            const filePath = path.join(this.storageDir, filename);
            const data = JSON.parse(await fs.readFile(filePath, 'utf-8'));
            logger.info(`Data retrieved from: ${filePath}`);
            return data;
        } catch (error) {
            logger.error('Failed to retrieve data:', error);
            throw error;
        }
    }

    /**
     * List all saved data files
     * @returns {Promise<Array<string>>} List of filenames
     */
    async listDataFiles() {
        try {
            const files = await fs.readdir(this.storageDir);
            return files.filter(file => file.endsWith('.json'));
        } catch (error) {
            logger.error('Failed to list data files:', error);
            throw error;
        }
    }

    /**
     * Clean up old data files (e.g., older than 30 days)
     */
    async cleanupOldData() {
        const thirtyDays = 30 * 24 * 60 * 60 * 1000;
        const now = Date.now();
        
        const files = await this.listDataFiles();
        for (const file of files) {
            const filePath = path.join(this.storageDir, file);
            const stats = await fs.stat(filePath);
            if (now - stats.mtime > thirtyDays) {
                try {
                    await fs.unlink(filePath);
                    logger.info(`Removed old data file: ${file}`);
                } catch (error) {
                    logger.error('Failed to remove old data file:', error);
                }
            }
        }
    }
}

module.exports = { DataStorage };
