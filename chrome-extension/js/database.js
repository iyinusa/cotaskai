/**
 * database.js - Dexie database implementation for CoTaskAI
 * Replaces chrome.storage.local with IndexedDB via Dexie.js
 * Includes Dexie Cloud sync capabilities
 */

// Initialize Dexie and configure cloud sync
const db = new Dexie('CoTaskAI');

// Add Dexie Cloud addon to the database - use self.dexieCloud in service worker context
try {
    db.use(typeof dexieCloud !== 'undefined' ? dexieCloud : self.dexieCloud);
} catch (err) {
    console.error('Failed to load Dexie Cloud addon:', err);
}

// Configure the database schema with cloud sync enabled tables
db.version(1).stores({
    conversations: '++id, tabUrl, timestamp, query, response, [tabUrl+timestamp]', // @sync
    pageContents: 'tabUrl, content',
    settings: 'key',
    apiKeys: 'key',
    floatingButton: 'key, enabled, position', // @sync
    syncSettings: 'key'
});

// Database access wrapper
const Database = {
    // Initialize database
    async initialize() {
        // Check if we have any settings, otherwise add defaults
        const settings = await this.getSettings();
        if (!Object.keys(settings).length) {
            await this.updateSettings({
                model: 'gpt-3.5-turbo',
                temperature: 0.7,
                maxTokens: 1024
            });
        }
        
        // Setup automatic sync if needed
        await this.setupAutoSync();
    },

    // Conversations methods
    async saveConversation(data) {
        try {
            await db.conversations.add({
                tabUrl: data.tabUrl,
                timestamp: data.timestamp,
                query: data.query,
                response: data.response
            });
            return { success: true };
        } catch (error) {
            console.error('Error saving conversation:', error);
            return { success: false, error: error.message };
        }
    },

    async getConversations(tabUrl) {
        try {
            return await db.conversations
                .where('tabUrl')
                .equals(tabUrl)
                .sortBy('timestamp');
        } catch (error) {
            console.error('Error getting conversations:', error);
            return [];
        }
    },

    async getAllConversations() {
        try {
            return await db.conversations.toArray();
        } catch (error) {
            console.error('Error getting all conversations:', error);
            return [];
        }
    },

    async clearConversations() {
        try {
            await db.conversations.clear();
            return { success: true };
        } catch (error) {
            console.error('Error clearing conversations:', error);
            return { success: false, error: error.message };
        }
    },

    // Page content methods
    async savePageContent(tabUrl, content) {
        try {
            await db.pageContents.put({
                tabUrl,
                content
            });
            return { success: true };
        } catch (error) {
            console.error('Error saving page content:', error);
            return { success: false, error: error.message };
        }
    },

    async getPageContent(tabUrl) {
        try {
            const pageContent = await db.pageContents.get(tabUrl);
            return pageContent ? pageContent.content : '';
        } catch (error) {
            console.error('Error getting page content:', error);
            return '';
        }
    },

    // Settings methods
    async updateSettings(settings) {
        try {
            await db.settings.put({
                key: 'general',
                ...settings
            });
            return { success: true };
        } catch (error) {
            console.error('Error updating settings:', error);
            return { success: false, error: error.message };
        }
    },

    async getSettings() {
        try {
            const settings = await db.settings.get('general');
            return settings || {};
        } catch (error) {
            console.error('Error getting settings:', error);
            return {};
        }
    },

    // API key methods
    async saveApiKeys(apiKeys) {
        try {
            await db.apiKeys.put({
                key: 'apiKeys',
                ...apiKeys
            });
            return { success: true };
        } catch (error) {
            console.error('Error saving API keys:', error);
            return { success: false, error: error.message };
        }
    },

    async getApiKeys() {
        try {
            const apiKeys = await db.apiKeys.get('apiKeys');
            return apiKeys || {};
        } catch (error) {
            console.error('Error getting API keys:', error);
            return {};
        }
    },

    // Floating button methods
    async setFloatingButtonState(enabled) {
        try {
            await db.floatingButton.put({
                key: 'state',
                enabled
            });
            return { success: true };
        } catch (error) {
            console.error('Error setting floating button state:', error);
            return { success: false, error: error.message };
        }
    },

    async getFloatingButtonState() {
        try {
            const state = await db.floatingButton.get('state');
            return state || { enabled: false };
        } catch (error) {
            console.error('Error getting floating button state:', error);
            return { enabled: false };
        }
    },
    
    async saveFloatingButtonPosition(position) {
        try {
            await db.floatingButton.put({
                key: 'position',
                position
            });
            return { success: true };
        } catch (error) {
            console.error('Error saving floating button position:', error);
            return { success: false, error: error.message };
        }
    },

    async getFloatingButtonPosition() {
        try {
            const positionEntry = await db.floatingButton.get('position');
            return positionEntry ? positionEntry.position : {
                left: '20px',
                top: '20px'
            };
        } catch (error) {
            console.error('Error getting floating button position:', error);
            return {
                left: '20px',
                top: '20px'
            };
        }
    },

    // Sync settings methods
    async updateSyncSettings(settings) {
        try {
            const current = await db.syncSettings.get('syncSettings') || {};
            await db.syncSettings.put({
                key: 'syncSettings',
                ...current,
                ...settings
            });
            return { success: true };
        } catch (error) {
            console.error('Error updating sync settings:', error);
            return { success: false, error: error.message };
        }
    },

    async getSyncSettings() {
        try {
            const settings = await db.syncSettings.get('syncSettings');
            return settings || { 
                enabled: false,
                autoSync: false,
                syncInterval: 5,
                lastSynced: null
            };
        } catch (error) {
            console.error('Error getting sync settings:', error);
            return {
                enabled: false,
                autoSync: false,
                syncInterval: 5,
                lastSynced: null
            };
        }
    },

    // Cloud sync authentication methods
    async authenticate(email) {
        try {
            // Connect to Dexie Cloud and send an email with a login link
            await db.cloud.login({ email });
            return {
                success: true,
                message: 'Authentication email sent to ' + email
            };
        } catch (error) {
            console.error('Error authenticating with Dexie Cloud:', error);
            return { 
                success: false, 
                error: error.message 
            };
        }
    },

    async isAuthenticated() {
        try {
            // Check if user is authenticated
            const userId = await db.cloud.currentUserId();
            return !!userId;
        } catch (error) {
            console.error('Error checking authentication status:', error);
            return false;
        }
    },

    async signOut() {
        try {
            // Sign out from Dexie Cloud
            await db.cloud.logout();
            return { 
                success: true 
            };
        } catch (error) {
            console.error('Error signing out from Dexie Cloud:', error);
            return { 
                success: false, 
                error: error.message 
            };
        }
    },

    // Sync data with Dexie Cloud
    async syncData() {
        try {
            // Sync data with Dexie Cloud
            const result = await db.cloud.sync();
            
            // Update last synced time
            await this.updateSyncSettings({
                lastSynced: new Date().toISOString()
            });
            
            return {
                success: true,
                pullCount: result.pullCount,
                pushCount: result.pushCount
            };
        } catch (error) {
            console.error('Error syncing with Dexie Cloud:', error);
            return {
                success: false,
                error: error.message
            };
        }
    },

    // Setup automatic sync process
    async setupAutoSync() {
        // Service worker context doesn't have window, use self instead
        // Clear any existing intervals
        if (self.syncInterval) {
            clearInterval(self.syncInterval);
            self.syncInterval = null;
        }
        
        // Check if auto sync is enabled
        const syncSettings = await this.getSyncSettings();
        if (!syncSettings.enabled || !syncSettings.autoSync) return;
        
        // Check if user is authenticated
        const isAuth = await this.isAuthenticated();
        if (!isAuth) return;
        
        // Set up interval for automatic sync
        const intervalMinutes = syncSettings.syncInterval || 5;
        self.syncInterval = setInterval(async () => {
            // Only sync if the user is still authenticated
            if (await this.isAuthenticated()) {
                await this.syncData();
            } else {
                // If user is no longer authenticated, clear interval
                clearInterval(self.syncInterval);
                self.syncInterval = null;
            }
        }, intervalMinutes * 60 * 1000);
    }
};

// Listen for changes to sync settings using hooks
db.syncSettings.hook('updating', (modifications, primKey, obj) => {
    // If sync settings are modified, update the auto sync
    setTimeout(async () => {
        await Database.setupAutoSync();
    }, 0);
});

// Initialize Dexie Cloud with configuration
db.cloud.configure({
    dxcloudUrl: "https://zhzsa0sb1.dexie.cloud", // Your Dexie Cloud URL
    requireAuth: false, // Allow unauthenticated access but sync when authenticated
    schema: {
        // Define which tables should be synced (@sync is added in the schema above)
        conversations: {
            sync: true
        },
        floatingButton: {
            sync: true
        }
    }
});