/**
 * database.js - Dexie database implementation for CoTaskAI
 * Replaces chrome.storage.local with IndexedDB via Dexie.js
 * Includes Dexie Cloud sync capabilities
 */

// Determine the current execution context (browser window or service worker)
const isWindow = typeof window !== 'undefined';
const isSelf = typeof self !== 'undefined';
const globalScope = isWindow ? window : (isSelf ? self : {});

// Make sure Dexie is available
let Dexie;
if (isWindow) {
    Dexie = window.Dexie;
} else if (isSelf) {
    Dexie = self.Dexie;
} else {
    console.error('Unable to determine execution context');
}

// Create the database instance
const db = new Dexie('CoTaskAI');

// Configure the database schema
db.version(1).stores({
    conversations: '++id, tabUrl, timestamp, query, response, [tabUrl+timestamp]',
    pageContents: 'tabUrl, content',
    settings: 'key',
    apiKeys: 'key', // Not synced for security
    floatingButton: 'key, enabled, position',
    syncSettings: 'key'
});

// Check if Dexie Cloud is available
let cloudConfigured = false;
try {
    // Configure cloud if available
    if (db.cloud) {
        // Use the cloud property added by our wrapper
        db.cloud.configure({
            databaseUrl: "https://zhzsa0sb1.dexie.cloud",
            requireAuth: false, 
            unsyncedTables: ['apiKeys'] // Explicitly exclude apiKeys from syncing
        });
        cloudConfigured = true;
        console.log("Dexie Cloud configured successfully");
    } else {
        console.warn("Dexie Cloud not available - offline only mode");
    }
} catch (err) {
    console.error("Error configuring Dexie Cloud:", err);
}

// Database access wrapper
const Database = {
    // Initialize database
    async initialize() {
        try {
            // Check if we have any settings, otherwise add defaults
            const settings = await this.getSettings();
            if (!Object.keys(settings).length) {
                await this.updateSettings({
                    model: 'gpt-3.5-turbo',
                    temperature: 0.7,
                    maxTokens: 1024
                });
            }

            // Setup automatic sync if cloud is configured
            if (cloudConfigured) {
                await this.setupAutoSync();
            }

            return { success: true };
        } catch (error) {
            console.error('Error initializing database:', error);
            return { success: false, error: error.message };
        }
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
            // Check if cloud is configured and login method is available
            if (!cloudConfigured || !db.cloud || typeof db.cloud.login !== 'function') {
                console.error('Dexie Cloud not properly initialized or login method not available');
                return {
                    success: false,
                    error: 'Dexie Cloud not properly initialized'
                };
            }

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
            if (!cloudConfigured || !db.cloud) {
                return false;
            }

            // Check for currentUserId method
            if (typeof db.cloud.currentUserId === 'function') {
                const userId = await db.cloud.currentUserId();
                return !!userId;
            }

            return false;
        } catch (error) {
            console.error('Error checking authentication status:', error);
            return false;
        }
    },

    async signOut() {
        try {
            // Check if cloud is configured and logout method is available
            if (!cloudConfigured || !db.cloud || typeof db.cloud.logout !== 'function') {
                return {
                    success: false,
                    error: 'Dexie Cloud not properly initialized'
                };
            }

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
            // Check if cloud is configured and sync method is available
            if (!cloudConfigured || !db.cloud || typeof db.cloud.sync !== 'function') {
                return {
                    success: false,
                    error: 'Dexie Cloud not properly initialized'
                };
            }

            // Sync data with Dexie Cloud
            const result = await db.cloud.sync();

            // Update last synced time
            await this.updateSyncSettings({
                lastSynced: new Date().toISOString()
            });

            return {
                success: true,
                pullCount: result.pullCount || 0,
                pushCount: result.pushCount || 0
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
        // Clear any existing intervals
        if (globalScope.syncInterval) {
            clearInterval(globalScope.syncInterval);
            globalScope.syncInterval = null;
        }

        // Check if auto sync is enabled
        const syncSettings = await this.getSyncSettings();
        if (!syncSettings.enabled || !syncSettings.autoSync) return;

        // Check if cloud is configured
        if (!cloudConfigured || !db.cloud) {
            console.warn('Cannot setup auto sync - Dexie Cloud not configured');
            return;
        }

        // Check if user is authenticated
        const isAuth = await this.isAuthenticated();
        if (!isAuth) return;

        // Set up interval for automatic sync
        const intervalMinutes = syncSettings.syncInterval || 5;
        globalScope.syncInterval = setInterval(async () => {
            try {
                // Only sync if the user is still authenticated
                if (await this.isAuthenticated()) {
                    await this.syncData();
                } else {
                    // If user is no longer authenticated, clear interval
                    clearInterval(globalScope.syncInterval);
                    globalScope.syncInterval = null;
                }
            } catch (error) {
                console.error('Auto-sync error:', error);
            }
        }, intervalMinutes * 60 * 1000);

        console.log(`Auto-sync configured to run every ${intervalMinutes} minutes`);
    }
};

// Register the database instance for direct access in other scripts if needed
if (isWindow) {
    window.cotaskaiDb = db;
    window.Database = Database;
} else if (isSelf) {
    self.cotaskaiDb = db;
    self.Database = Database;
}

// Export the Database API
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Database;
} else {
    globalScope.Database = Database;
}

console.log("Database layer initialized");