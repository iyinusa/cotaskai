/**
 * database.js - Dexie database implementation for CoTaskAI
 * Replaces chrome.storage.local with IndexedDB via Dexie.js
 */

// Initialize the database
const db = new Dexie('CoTaskAIDB');

// Define database schema
db.version(1).stores({
    settings: 'key', // General settings like model, darkMode, etc.
    apiKeys: 'key',  // API keys for different providers
    conversations: '++id, tabUrl, timestamp', // Conversation history
    pageContent: 'url', // Temporary page content for the current session
    floatingButton: 'key' // Floating button state and position
});

// Helper functions to work with the database
const Database = {
    /**
     * Initialize the database and set defaults if needed
     */
    async initialize() {
        // Set default settings if they don't exist
        const settings = await db.settings.get('general');
        if (!settings) {
            await db.settings.put({
                key: 'general',
                model: 'gpt-3.5-turbo',
                darkMode: false
            });
        }

        // Set default floating button settings if they don't exist
        const floatingBtn = await db.floatingButton.get('state');
        if (!floatingBtn) {
            await db.floatingButton.put({
                key: 'state',
                enabled: true
            });
        }
    },

    /**
     * Get settings from the database
     * @returns {Promise<Object>} The settings object
     */
    async getSettings() {
        const settings = await db.settings.get('general');
        return settings || { model: 'gpt-3.5-turbo', darkMode: false };
    },

    /**
     * Update settings in the database
     * @param {Object} newSettings - The new settings to save
     */
    async updateSettings(newSettings) {
        const settings = await this.getSettings();
        await db.settings.put({
            key: 'general',
            ...settings,
            ...newSettings
        });
    },

    /**
     * Get all API keys
     * @returns {Promise<Object>} Object containing all API keys
     */
    async getApiKeys() {
        const keys = await db.apiKeys.get('providers');
        return keys || { 
            openai: '', 
            gemini: '', 
            anthropic: '', 
            xai: '', 
            deepseek: '' 
        };
    },

    /**
     * Save API keys to the database
     * @param {Object} keys - Object containing API keys
     */
    async saveApiKeys(keys) {
        await db.apiKeys.put({
            key: 'providers',
            ...keys
        });
    },

    /**
     * Get the API key for backward compatibility
     * @returns {Promise<string>} The OpenAI API key
     */
    async getLegacyApiKey() {
        const keys = await this.getApiKeys();
        return keys.openai || '';
    },

    /**
     * Save page content for the current session
     * @param {string} url - The URL of the page
     * @param {string} content - The page content
     */
    async savePageContent(url, content) {
        await db.pageContent.put({
            url,
            content
        });
    },

    /**
     * Get page content for a URL
     * @param {string} url - The URL to get content for
     * @returns {Promise<string>} The page content
     */
    async getPageContent(url) {
        const data = await db.pageContent.get(url);
        return data ? data.content : '';
    },

    /**
     * Get all conversations for a specific URL
     * @param {string} url - The URL to filter conversations by
     * @returns {Promise<Array>} Array of conversation objects
     */
    async getConversations(url) {
        return await db.conversations.where('tabUrl').equals(url).toArray();
    },

    /**
     * Get all conversations
     * @returns {Promise<Array>} Array of all conversation objects
     */
    async getAllConversations() {
        return await db.conversations.toArray();
    },

    /**
     * Save a new conversation to the database
     * @param {Object} conversation - The conversation to save
     */
    async saveConversation(conversation) {
        await db.conversations.add({
            ...conversation,
            timestamp: conversation.timestamp || new Date().toISOString()
        });
    },

    /**
     * Clear all conversations
     */
    async clearConversations() {
        await db.conversations.clear();
    },

    /**
     * Get floating button state
     * @returns {Promise<Object>} Floating button state object
     */
    async getFloatingButtonState() {
        const state = await db.floatingButton.get('state');
        return state || { enabled: true };
    },

    /**
     * Set floating button state
     * @param {boolean} enabled - Whether the floating button is enabled
     */
    async setFloatingButtonState(enabled) {
        const state = await this.getFloatingButtonState();
        await db.floatingButton.put({
            key: 'state',
            ...state,
            enabled
        });
    },

    /**
     * Get floating button position
     * @returns {Promise<Object>} Floating button position object
     */
    async getFloatingButtonPosition() {
        const position = await db.floatingButton.get('position');
        return position || { top: '20px', left: '20px' };
    },

    /**
     * Save floating button position
     * @param {Object} position - The position object with top and left
     */
    async saveFloatingButtonPosition(position) {
        await db.floatingButton.put({
            key: 'position',
            ...position
        });
    }
};

// Initialize the database when the script loads
Database.initialize().catch(err => {
    console.error('Failed to initialize database:', err);
});