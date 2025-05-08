$(document).ready(() => {
    const $modelThinking = $('#modelThinking');
    const $userInput = $('#prompt');
    const $sendBtn = $('#sendBtn');
    const $chatHistory = $('#chat-history');
    const $tabPanes = $('.tab-pane');
    const $tabLinks = $('.tablinks');
    const $settingsModal = $('#settingsModal');
    const $settingsBtn = $('#settingsBtn');
    const $closeSettingsBtn = $('.close-modal');
    const $themeToggleBtn = $('#themeToggleBtn');
    const $themeSelect = $('#themeSelect');
    const $floatingToggleBtn = $('#floatingToggleBtn');
    const $cloudSyncIndicator = $('#cloudSyncIndicator');
    const $syncStatus = $('#syncStatus');
    
    // Add flag to prevent duplicate conversation loading
    let isLoadingConversations = false;

    // Update version display from manifest
    (function updateVersionFromManifest() {
        const $versionElement = $('.version');
        if ($versionElement.length) {
            try {
                // chrome.runtime.getManifest() is synchronous, not a Promise
                const manifest = chrome.runtime.getManifest();
                $versionElement.text(`v${manifest.version}`);
            } catch (err) {
                console.error('Error getting manifest version:', err);
            }
        }
    })();
    
    // Format timestamp to a user-friendly format
    const formatTimestamp = (timestamp) => {
        if (!timestamp) return '';
        
        const date = new Date(timestamp);
        if (isNaN(date)) return '';
        
        const today = new Date();
        const isToday = date.getDate() === today.getDate() &&
                       date.getMonth() === today.getMonth() &&
                       date.getFullYear() === today.getFullYear();
        
        // Format time as HH:MM
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        const time = `${hours}:${minutes}`;
        
        // If message is from today, just show time, otherwise show date and time
        if (isToday) {
            return time;
        } else {
            const day = date.getDate().toString().padStart(2, '0');
            const month = (date.getMonth() + 1).toString().padStart(2, '0');
            return `${day}/${month} ${time}`;
        }
    };

    // Auto-resize function
    const autoResize = (elem) => {
        if (!elem) return;
        elem.style.height = 'auto';
        elem.style.height = elem.scrollHeight + 'px';
    };

    // Bind the input event to auto-resize the textarea as user types
    $userInput.on('input', function () {
        autoResize(this);
    });

    // Initialize popup
    const initPopup = async () => {
        await loadConversations();
        await getCurrentPageContent();
        applySavedSettings();
        updateSyncStatus();
        
        // Make textarea autofocus for better UX
        setTimeout(() => {
            $userInput.focus();
        }, 300);
    };
    
    // Update cloud sync status indicator
    const updateSyncStatus = async () => {
        try {
            // Get sync settings from the database
            const syncSettings = await Database.getSyncSettings();
            
            // Check if sync is enabled and authenticated
            if (!syncSettings.enabled) {
                $cloudSyncIndicator.removeClass('syncing synced error').addClass('offline');
                $syncStatus.text('Sync off');
                return;
            }
            
            // Check authentication status
            const isAuth = await Database.isAuthenticated();
            if (!isAuth) {
                $cloudSyncIndicator.removeClass('syncing synced offline').addClass('error');
                $syncStatus.text('Not logged in');
                return;
            }
            
            // If authenticated and enabled, show the last sync time or trigger a sync
            if (syncSettings.lastSynced) {
                $cloudSyncIndicator.removeClass('syncing error offline').addClass('synced');
                
                // Calculate time since last sync
                const lastSync = new Date(syncSettings.lastSynced);
                const now = new Date();
                const diffMinutes = Math.floor((now - lastSync) / (1000 * 60));
                
                if (diffMinutes < 1) {
                    $syncStatus.text('Just synced');
                } else if (diffMinutes < 60) {
                    $syncStatus.text(`Synced ${diffMinutes}m ago`);
                } else {
                    const diffHours = Math.floor(diffMinutes / 60);
                    $syncStatus.text(`Synced ${diffHours}h ago`);
                }
            } else {
                $cloudSyncIndicator.removeClass('syncing error offline').addClass('synced');
                $syncStatus.text('Synced');
            }
        } catch (error) {
            console.error('Error updating sync status:', error);
            $cloudSyncIndicator.removeClass('syncing synced offline').addClass('error');
            $syncStatus.text('Sync error');
        }
    };
    
    // Trigger manual sync when the indicator is clicked
    const triggerManualSync = async () => {
        try {
            // Check if sync is enabled
            const syncSettings = await Database.getSyncSettings();
            if (!syncSettings.enabled) {
                // If sync is disabled, open settings modal to sync tab when clicked
                $settingsModal.addClass('active');
                // Switch to sync tab
                $tabLinks.removeClass('active');
                $tabPanes.removeClass('active');
                $('[data-tab="sync"]').addClass('active');
                $('#sync').addClass('active');
                return;
            }
            
            // Check authentication
            const isAuth = await Database.isAuthenticated();
            if (!isAuth) {
                // If not authenticated, open settings modal to sync tab
                $settingsModal.addClass('active');
                // Switch to sync tab
                $tabLinks.removeClass('active');
                $tabPanes.removeClass('active');
                $('[data-tab="sync"]').addClass('active');
                $('#sync').addClass('active');
                return;
            }
            
            // Show syncing state
            $cloudSyncIndicator.removeClass('synced error offline').addClass('syncing');
            $syncStatus.text('Syncing...');
            
            // Trigger sync
            const result = await Database.syncData();
            
            // Update UI based on result
            if (result.success) {
                $cloudSyncIndicator.removeClass('syncing error offline').addClass('synced');
                $syncStatus.text('Just synced');
                
                // Reload conversations to reflect any changes from the cloud
                $chatHistory.empty();
                await loadConversations();
            } else {
                $cloudSyncIndicator.removeClass('syncing synced offline').addClass('error');
                $syncStatus.text('Sync failed');
            }
        } catch (error) {
            console.error('Error during manual sync:', error);
            $cloudSyncIndicator.removeClass('syncing synced offline').addClass('error');
            $syncStatus.text('Sync error');
        }
    };
    
    // Listen for messages from background script (for the floating modal)
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'floating_modal_opened') {
            console.log('Received floating_modal_opened message from background script');
            
            // Only load conversations if they're not already being loaded
            if (!isLoadingConversations) {
                isLoadingConversations = true;
                $chatHistory.empty(); // Clear current conversations
                loadConversations().then(() => {
                    isLoadingConversations = false;
                    console.log('Conversations loaded successfully in floating modal');
                }).catch(error => {
                    console.error('Error loading conversations:', error);
                    isLoadingConversations = false;
                });
            }
            
            // Send response to acknowledge receipt
            if (sendResponse) {
                sendResponse({ success: true });
            }
        }
        return true; // Keep message channel open for async response
    });

    // Get page content
    const getCurrentPageContent = async () => {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (/\.pdf(\?.*)?$/i.test(tab.url)) {
                const response = await fetch(tab.url);
                const arrayBuffer = await response.arrayBuffer();

                // Set the worker URL to the local pdf.worker.min.js file
                pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('js/pdf/pdf.worker.min.js');

                const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                let fullText = '';

                for (let i = 1; i <= pdfDoc.numPages; i++) {
                    const page = await pdfDoc.getPage(i);
                    const textContent = await page.getTextContent();
                    const pageText = textContent.items.map(item => item.str).join(' ');
                    fullText += `\n${pageText}`;
                }

                // Save to database instead of chrome.storage
                await Database.savePageContent(tab.url, fullText);
            } else {
                const results = await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: () => document.body.innerText
                });
                
                // Save to database instead of chrome.storage
                await Database.savePageContent(tab.url, results[0].result);
            }
        } catch (error) {
            displayMessage(`Content Error: ${error.message}. Ensure you are own a fully loaded valid browsing content (Website, PDF)`, 'error');
        }
    };

    // Apply theme setting
    const applyTheme = (theme) => {
        const isDarkMode = theme === 'dark' || 
            (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
        
        // Set theme attribute on document
        document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
        
        // Update theme toggle button icon
        if (isDarkMode) {
            $themeToggleBtn.find('i').removeClass('fa-moon').addClass('fa-sun');
        } else {
            $themeToggleBtn.find('i').removeClass('fa-sun').addClass('fa-moon');
        }
    };

    // Toggle theme between light and dark
    const toggleTheme = async () => {
        const settings = await Database.getSettings();
        let currentTheme = settings.theme || 'light';
        
        if (currentTheme === 'system') {
            // If system theme, toggle between light and dark directly
            currentTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        } else {
            // Otherwise toggle the saved theme
            currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
        }
        
        await Database.updateSettings({ theme: currentTheme });
        applyTheme(currentTheme);
        
        // Update theme select dropdown
        $themeSelect.val(currentTheme);
    };

    // Listen for system theme changes
    const setupThemeChangeListener = () => {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', async e => {
            const settings = await Database.getSettings();
            if (settings.theme === 'system') {
                applyTheme('system');
            }
        });
    };

    // Toggle floating button
    const toggleFloatingButton = async () => {
        const floatingBtnState = await Database.getFloatingButtonState();
        const newState = !floatingBtnState.enabled;
        
        // Update the database state
        await Database.setFloatingButtonState(newState);
        
        // Update button appearance to reflect current state
        updateFloatingButtonIcon(newState);
        
        // Update the checkbox in settings modal to match
        $('#floatingButtonToggle').prop('checked', newState);
        
        // Notify all tabs about the change
        chrome.runtime.sendMessage({
            action: 'toggle_floating_button',
            forceState: newState
        });
        
        console.log('Floating button state updated:', newState);
    };
    
    // Update the floating button icon to reflect its current state
    const updateFloatingButtonIcon = (enabled) => {
        if (enabled) {
            $floatingToggleBtn.addClass('active');
            $floatingToggleBtn.attr('title', 'Disable Floating Button');
        } else {
            $floatingToggleBtn.removeClass('active');
            $floatingToggleBtn.attr('title', 'Enable Floating Button');
        }
    };

    // Event handlers
    const setupEventListeners = () => {
        // Cloud sync indicator click handler
        $cloudSyncIndicator.on('click', triggerManualSync);
        
        // Listen for Enter key press on the input field
        $userInput.on('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleUserMessage();
            }
        });

        // Listen for Send button click
        $sendBtn.on('click', handleUserMessage);

        // Toggle settings modal
        $settingsBtn.on('click', () => {
            $settingsModal.addClass('active');
        });

        // Close settings modal
        $closeSettingsBtn.on('click', () => {
            $settingsModal.removeClass('active');
        });
        
        // Export Chat button click handler
        $('#exportChatBtn').on('click', async () => {
            try {
                // Get the current tab URL
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                
                // Get conversations for the current tab
                const conversations = await Database.getConversations(tab.url);
                
                if (conversations.length === 0) {
                    alert('No conversations to export for this tab.');
                    return;
                }
                
                // Show export options dialog
                const exportFormat = confirm(
                    'Choose export format:\n\n' +
                    'OK = JSON (includes metadata, good for backup)\n' +
                    'Cancel = Plain text (easier to read)'
                ) ? 'json' : 'text';
                
                let content = '';
                let filename = '';
                let dataType = '';
                
                // Format according to chosen option
                if (exportFormat === 'json') {
                    // JSON format (full data)
                    content = JSON.stringify({
                        url: tab.url,
                        title: tab.title || 'Unknown Page',
                        exportDate: new Date().toISOString(),
                        conversations
                    }, null, 2);
                    filename = `cotaskai-chat-${new Date().getTime()}.json`;
                    dataType = 'application/json';
                } else {
                    // Plain text format (more readable)
                    let plainText = `CoTaskAI Chat Export\n`;
                    plainText += `URL: ${tab.url}\n`;
                    plainText += `Date: ${new Date().toLocaleString()}\n\n`;
                    
                    conversations.forEach(convo => {
                        if (convo.query) {
                            plainText += `User: ${convo.query}\n`;
                            plainText += `Time: ${formatTimestamp(convo.timestamp)}\n\n`;
                        }
                        if (convo.response) {
                            plainText += `AI: ${convo.response}\n`;
                            plainText += `Time: ${formatTimestamp(convo.timestamp)}\n\n`;
                        }
                        plainText += `---\n\n`;
                    });
                    
                    content = plainText;
                    filename = `cotaskai-chat-${new Date().getTime()}.txt`;
                    dataType = 'text/plain';
                }
                
                // Create a downloadable blob
                const blob = new Blob([content], { type: dataType });
                const url = URL.createObjectURL(blob);
                
                // Create a temporary link and trigger the download
                const downloadLink = document.createElement('a');
                downloadLink.href = url;
                downloadLink.download = filename;
                document.body.appendChild(downloadLink);
                downloadLink.click();
                
                // Clean up
                setTimeout(() => {
                    document.body.removeChild(downloadLink);
                    URL.revokeObjectURL(url);
                }, 100);
                
                console.log('Chat exported successfully');
            } catch (error) {
                console.error('Error exporting chat:', error);
                alert('An error occurred while exporting the chat history.');
            }
        });

        // Clear chat button click handler
        $('#clearChatBtn').on('click', async () => {
            // Show confirmation dialog
            if (confirm('Are you sure you want to clear the chat history for this tab? This action cannot be undone.')) {
                try {
                    // Get the current tab URL
                    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                    
                    // Clear the chat history in the UI
                    $chatHistory.empty();
                    
                    // Get all conversations from the database
                    const allConversations = await Database.getAllConversations();
                    
                    // Filter out conversations from the current tab
                    const otherTabConversations = allConversations.filter(
                        conversation => conversation.tabUrl !== tab.url
                    );
                    
                    // Clear all conversations
                    await Database.clearConversations();
                    
                    // Re-add conversations from other tabs
                    for (const conversation of otherTabConversations) {
                        await Database.saveConversation(conversation);
                    }
                    
                    console.log('Chat history cleared for the current tab');
                    
                    // After clearing conversations, trigger a sync if enabled
                    try {
                        const syncSettings = await Database.getSyncSettings();
                        if (syncSettings.enabled && await Database.isAuthenticated()) {
                            // Show syncing state
                            $cloudSyncIndicator.removeClass('synced error offline').addClass('syncing');
                            $syncStatus.text('Syncing...');
                            
                            // Trigger sync
                            await Database.syncData();
                            updateSyncStatus();
                        }
                    } catch (error) {
                        console.error('Error syncing after clear:', error);
                    }
                } catch (error) {
                    console.error('Error clearing chat history:', error);
                    alert('An error occurred while clearing the chat history.');
                }
            }
        });

        // Listen for tab changes
        $tabLinks.on('click', function () {
            const tabId = $(this).data('tab');
            
            // Update active tab button
            $tabLinks.removeClass('active');
            $(this).addClass('active');
            
            // Update active tab content
            $tabPanes.removeClass('active');
            $(`#${tabId}`).addClass('active');
        });

        // Theme toggle button click
        $themeToggleBtn.on('click', toggleTheme);
        
        // Floating button toggle click
        $floatingToggleBtn.on('click', toggleFloatingButton);

        // Theme select change
        $themeSelect.on('change', async function() {
            const selectedTheme = $(this).val();
            await Database.updateSettings({ theme: selectedTheme });
            applyTheme(selectedTheme);
        });

        // Enable sync toggle
        $('#enableSyncToggle').on('change', function() {
            const enabled = $(this).prop('checked');
            toggleSyncSections(enabled);
        });
        
        // Authentication button
        $('#auth-button').on('click', authenticate);
        
        // Sign out button
        $('#sign-out-button').on('click', signOut);
        
        // Sync now button
        $('#sync-now-button').on('click', syncNow);

        // Save settings handler
        $('#save-settings').on('click', async () => {
            // Show a saving indicator or spinner
            const $saveBtn = $('#save-settings');
            const originalText = $saveBtn.text();
            $saveBtn.prop('disabled', true);
            $saveBtn.text('Saving...');
            
            try {
                // Collect API keys
                const apiKeys = {
                    openai: $('#openAIKey').val().trim(),
                    gemini: $('#geminiKey').val().trim(),
                    anthropic: $('#anthropicKey').val().trim(),
                    xai: $('#xaiKey').val().trim(),
                    deepseek: $('#deepseekKey').val().trim()
                };
                
                // Collect appearance settings
                const theme = $('#themeSelect').val();
                const enableAnimations = $('#animationsToggle').prop('checked');
                
                // Collect preference settings
                const enableFloatingButton = $('#floatingButtonToggle').prop('checked');
                const autoLoadContext = $('#autoContextToggle').prop('checked');
                const enableNotifications = $('#notificationsToggle').prop('checked');
                
                // Collect sync settings
                const enableSync = $('#enableSyncToggle').prop('checked');
                const autoSync = $('#autoSyncToggle').prop('checked');
                const syncInterval = parseInt($('#sync-interval').val(), 10);
                
                // Save all settings to database
                await Database.saveApiKeys(apiKeys);
                await Database.updateSettings({
                    theme,
                    enableAnimations,
                    enableFloatingButton,
                    autoLoadContext,
                    enableNotifications
                });
                
                // Update floating button state if necessary
                await Database.setFloatingButtonState(enableFloatingButton);
                
                // Save sync settings
                await Database.updateSyncSettings({
                    enabled: enableSync,
                    autoSync: autoSync,
                    syncInterval: syncInterval
                });
                
                // Update model dropdown availability based on the newly saved API keys
                updateModelDropdownAvailability(apiKeys);
                
                // Make sure the saved model is still selected or switch to a valid one
                const selectedModel = $('#modelSelect').val();
                if (selectedModel) {
                    // Update model in the database
                    await Database.updateSettings({ model: selectedModel });
                }
                
                // Update sync status indicator
                updateSyncStatus();
                
                console.log('Settings saved successfully!');
                
                // Close the settings modal after saving
                $settingsModal.removeClass('active');
            } catch (error) {
                console.error('Error saving settings:', error);
                alert('Error saving settings: ' + error.message);
            } finally {
                // Restore button state
                $saveBtn.prop('disabled', false);
                $saveBtn.text(originalText);
            }
        });

        // Listen for changes on the model selection dropdown
        $('#modelSelect').on('change', async () => {
            const selectedModel = $('#modelSelect').val();
            
            // Update model in the database
            await Database.updateSettings({ model: selectedModel });
            console.log('Model updated to:', selectedModel);
        });
        
        // Setup system theme change listener
        setupThemeChangeListener();
    };

    /**
     * Toggle the visibility of sync-related sections
     * @param {boolean} enabled - Whether sync is enabled
     */
    function toggleSyncSections(enabled) {
        if (enabled) {
            $('#auth-section').show();
            $('#sync-options').show();
        } else {
            $('#auth-section').hide();
            $('#sync-options').hide();
        }
    }
    
    /**
     * Authenticate with Dexie Cloud
     */
    async function authenticate() {
        const email = $('#auth-email').val().trim();
        if (!email || !isValidEmail(email)) {
            alert('Please enter a valid email address');
            return;
        }
        
        try {
            // Show spinner
            toggleAuthSpinner(true);
            
            // Attempt to authenticate
            const result = await Database.authenticate(email);
            
            if (result.success) {
                alert(result.message || 'Authentication email sent. Please check your inbox.');
                
                // Check auth status periodically for 2 minutes
                let checkCount = 0;
                const authCheckInterval = setInterval(async () => {
                    const isAuth = await Database.isAuthenticated();
                    if (isAuth) {
                        clearInterval(authCheckInterval);
                        await checkAuthStatus();
                        alert('Successfully authenticated!');
                        // Update sync status
                        updateSyncStatus();
                    } else if (++checkCount >= 24) { // 24 * 5 seconds = 2 minutes
                        clearInterval(authCheckInterval);
                    }
                }, 5000);
            } else {
                alert('Authentication failed: ' + (result.error || 'Unknown error'));
            }
        } catch (error) {
            console.error('Authentication error:', error);
            alert('Authentication error: ' + error.message);
        } finally {
            // Hide spinner
            toggleAuthSpinner(false);
        }
    }
    
    /**
     * Sign out from Dexie Cloud
     */
    async function signOut() {
        try {
            const result = await Database.signOut();
            
            if (result.success) {
                alert('Successfully signed out.');
                await checkAuthStatus();
                // Update sync status
                updateSyncStatus();
            } else {
                alert('Sign out failed: ' + (result.error || 'Unknown error'));
            }
        } catch (error) {
            console.error('Sign out error:', error);
            alert('Sign out error: ' + error.message);
        }
    }
    
    /**
     * Check authentication status and update UI
     */
    async function checkAuthStatus() {
        try {
            const isAuthenticated = await Database.isAuthenticated();
            
            // Show the appropriate section based on authentication status
            $('#not-authenticated-section').toggle(!isAuthenticated);
            $('#authenticated-section').toggle(isAuthenticated);
            
            if (isAuthenticated) {
                // Get user email and display it
                const userId = await db.cloud.currentUserId();
                if (userId) {
                    // In a real implementation, you might want to store and retrieve the email
                    // For now, we'll just use the user ID as a placeholder
                    $('#user-email').text(userId);
                }
            }
        } catch (error) {
            console.error('Error checking authentication status:', error);
        }
    }
    
    /**
     * Trigger manual sync with Dexie Cloud
     */
    async function syncNow() {
        try {
            // Show spinner
            toggleSyncSpinner(true);
            
            // Clear any previous sync results
            $('#sync-result').empty();
            
            // Trigger sync
            const result = await Database.syncData();
            
            if (result.success) {
                // Update last synced time
                $('#last-synced-container').show();
                $('#last-synced-time').text(formatDate(new Date()));
                
                // Show sync results
                $('#sync-result').html(
                    `<div class="alert alert-success">
                        Sync completed successfully!<br>
                        Pulled ${result.pullCount} items. Pushed ${result.pushCount} items.
                    </div>`
                );
                
                // Update sync status indicator
                updateSyncStatus();
            } else {
                $('#sync-result').html(
                    `<div class="alert alert-danger">
                        Sync failed: ${result.error || 'Unknown error'}
                    </div>`
                );
            }
        } catch (error) {
            console.error('Sync error:', error);
            $('#sync-result').html(
                `<div class="alert alert-danger">
                    Sync error: ${error.message}
                </div>`
            );
        } finally {
            // Hide spinner
            toggleSyncSpinner(false);
        }
    }
    
    /**
     * Toggle the authentication spinner
     * @param {boolean} show - Whether to show or hide the spinner
     */
    function toggleAuthSpinner(show) {
        $('#auth-spinner').toggleClass('d-none', !show);
        $('#auth-button').prop('disabled', show);
    }
    
    /**
     * Toggle the sync spinner
     * @param {boolean} show - Whether to show or hide the spinner
     */
    function toggleSyncSpinner(show) {
        $('#sync-spinner').toggleClass('d-none', !show);
        $('#sync-now-button').prop('disabled', show);
    }
    
    /**
     * Format date for display
     * @param {Date} date - The date to format
     * @returns {string} The formatted date string
     */
    function formatDate(date) {
        return date.toLocaleString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        });
    }
    
    /**
     * Validate email format
     * @param {string} email - The email to validate
     * @returns {boolean} Whether the email is valid
     */
    function isValidEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    }

    // Handle messages
    const handleUserMessage = async () => {
        const userInput = $userInput.val().trim();
        if (!userInput) return;

        try {
            // Display user input immediately
            displayMessage(userInput, 'prompt');
            $userInput.val('');

            // Show loading state
            startModelThinkingAnimation();
            
            // Get active tab info to save along with the conversation
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            // Get page content from database
            const pageContent = await Database.getPageContent(tab.url);

            const resp = await chrome.runtime.sendMessage({
                action: 'get_api_response',
                query: userInput,
                context: `${pageContent}`.trim()
            });

            if (resp.error) throw new Error(resp.error);

            // Animate AI message
            displayMessageAnimated(resp.response, 'response', new Date().toISOString());

            // Save conversation to database through background script
            try {
                await chrome.runtime.sendMessage({
                    action: 'save_conversation',
                    data: {
                        query: userInput,
                        response: resp.response,
                        timestamp: new Date().toISOString(),
                        tabUrl: tab.url,
                    }
                });

                // After saving conversation, trigger a sync if enabled
                const syncSettings = await Database.getSyncSettings();
                if (syncSettings.enabled && await Database.isAuthenticated()) {
                    // Don't show syncing UI to avoid disruption during conversation
                    try {
                        const result = await Database.syncData();
                        // Update the status indicator after sync
                        updateSyncStatus();
                    } catch (syncError) {
                        console.error('Sync error after conversation:', syncError);
                        // Don't show this error to user during conversation flow
                    }
                }
            } catch (saveError) {
                console.error('Error saving conversation:', saveError);
                // Don't interrupt the flow with this error
            }
        } catch (error) {
            console.error('Chat error:', error);
            
            // Handle specific "startsWith" error with a more user-friendly message
            if (error.message && error.message.includes("startsWith")) {
                displayMessage(`Error: There was a problem with the application's data flow. Please try refreshing the page or check your connection settings, ensure that right model is selected and model Key passed in settings.`, 'error');
            } else {
                displayMessage(`Error: ${error.message || 'Unknown error occurred'}`, 'error');
            }
        } finally {
            stopModelThinkingAnimation();
        }
    };
    
    // Load previous conversations
    async function loadConversations() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            // Get conversations from database instead of chrome.storage
            const conversations = await Database.getConversations(tab.url);

            if (conversations.length === 0) {
                // Display a centered message when no conversations are present
                $chatHistory.append(`
                    <div class="welcome-message text-center">
                        <div><img alt="CoTaskAI" src="images/icon.png" /></div>
                        <p>Start a dialogue with the Website or PDF document.</p>
                        <div class="disclaimer text-muted">
                            CoTaskAI helps you analyze text from the current page, and provide responses based on the context. Please note that you might be limited by the number of requests/token you can make to the AI service, depending on your selected model.
                        </div>
                    </div>
                `);
            } else {
                // Iterate over the filtered conversations array to display each conversation sequentially
                conversations.forEach(converse => {
                    if (converse.query) displayMessage(converse.query, 'prompt', converse.timestamp);
                    if (converse.response) displayMessage(converse.response, 'response', converse.timestamp);
                });
                
                // Apply syntax highlighting to code blocks after loading all conversations
                applyPrismSyntaxHighlighting();
            }
        } catch (error) {
            console.error("Error loading conversations:", error);
        }
    }

    // UI function to display message
    const displayMessage = (text, sender, timestamp = null, id = null) => {
        let formattedText;
        
        // Format the timestamp if provided
        let timeDisplay = '';
        if (timestamp) {
            timeDisplay = `<span class="message-time">${formatTimestamp(timestamp)}</span>`;
        }
        
        if (sender === 'response') {
            formattedText = formatResponseText(text);
        } else {
            formattedText = text.replace(/\n/g, '<br>');
        }
        
        const messageId = id ? `id="${id}"` : '';
        
        $chatHistory.append(`
            <div class="message ${sender}" ${messageId}>
                <div class="message-header">
                    ${sender.toUpperCase()}
                    ${timeDisplay}
                </div>
                <div class="message-content">${formattedText}</div>
            </div>
        `);
        
        // Apply syntax highlighting to code blocks
        applyPrismSyntaxHighlighting();
        
        if ($chatHistory[0]) {
            $chatHistory.scrollTop($chatHistory[0].scrollHeight);
        }
    };

    // Animated message display function for better UX
    const displayMessageAnimated = (text, sender, timestamp = null, id = null) => {
        let formattedText;
        
        // Format the timestamp if provided
        let timeDisplay = '';
        if (timestamp) {
            timeDisplay = `<span class="message-time">${formatTimestamp(timestamp)}</span>`;
        }
        
        if (sender === 'response') {
            formattedText = formatResponseText(text);
        } else {
            formattedText = text.replace(/\n/g, '<br>');
        }
        
        const messageId = id ? `id="${id}"` : '';
        
        // Create and append message container
        const $message = $(`
            <div class="message ${sender}" ${messageId}>
                <div class="message-header">
                    ${sender.toUpperCase()}
                    ${timeDisplay}
                </div>
                <div class="message-content"></div>
            </div>
        `);
        
        $chatHistory.append($message);
        const $content = $message.find('.message-content');
        
        // Animate the text appearing
        animateTyping(formattedText, $content[0], 0, 1);
        
        // Scroll to bottom
        if ($chatHistory[0]) {
            $chatHistory.scrollTop($chatHistory[0].scrollHeight);
        }
    };

    // Start thinking animation
    function startModelThinkingAnimation() {
        const modelThinking = document.getElementById('modelThinking');
        if (!modelThinking) return;
        
        modelThinking.style.display = 'flex';
    }

    // Stop thinking animation
    function stopModelThinkingAnimation() {
        const modelThinking = document.getElementById('modelThinking');
        if (modelThinking) {
            modelThinking.style.display = 'none';
        }
    }
    
    // Animate typing effect for text responses
    function animateTyping(text, element, index, speed) {
        if (index <= text.length) {
            // Display progressively more of the text
            element.innerHTML = text.substring(0, index);
            
            // Scroll to the bottom as text appears
            const chatHistory = document.getElementById('chat-history');
            if (chatHistory) {
                chatHistory.scrollTop = chatHistory.scrollHeight;
            }
            
            // Calculate a slightly random delay for natural typing effect
            const randomDelay = Math.random() * 10 + speed;
            
            // Schedule the next character
            setTimeout(() => {
                animateTyping(text, element, index + 1, speed);
            }, randomDelay);
        } else {
            // Animation is complete, apply code formatting and setup copy buttons
            setupCodeFormatting();
        }
    }

    // Update model dropdown based on API key availability
    function updateModelDropdownAvailability(apiKeys) {
        // Map of provider prefixes to their API key property
        const providerMap = {
            'OpenAI Models': 'openai',
            'Gemini Models': 'gemini',
            'Anthropic Models': 'anthropic', 
            'DeepSeek Models': 'deepseek',
            'xAI Models': 'xai'
        };
        
        // Get all optgroups in the model dropdown
        const $modelSelect = $('#modelSelect');
        const $optgroups = $modelSelect.find('optgroup');
        
        // Process each optgroup
        $optgroups.each(function() {
            const $optgroup = $(this);
            const label = $optgroup.attr('label');
            const apiKeyProperty = providerMap[label];
            
            if (apiKeyProperty) {
                // If there's no API key for this provider, disable the optgroup and its options
                const hasApiKey = apiKeys[apiKeyProperty] && apiKeys[apiKeyProperty].trim() !== '';
                
                if (!hasApiKey) {
                    // Add a disabled class to the optgroup for styling
                    $optgroup.addClass('disabled-optgroup');
                    
                    // Disable all options within this optgroup
                    $optgroup.find('option').prop('disabled', true).addClass('disabled-option');
                } else {
                    // Enable the optgroup and its options if they were previously disabled
                    $optgroup.removeClass('disabled-optgroup');
                    $optgroup.find('option').prop('disabled', false).removeClass('disabled-option');
                }
            }
        });
        
        // Check if the currently selected option is disabled
        const $selectedOption = $modelSelect.find('option:selected');
        if ($selectedOption.prop('disabled')) {
            // Find the first enabled option and select it
            const $firstEnabledOption = $modelSelect.find('option:not(:disabled):first');
            if ($firstEnabledOption.length > 0) {
                $modelSelect.val($firstEnabledOption.val());
                // Trigger change event to update the saved model
                $modelSelect.trigger('change');
            }
        }
    }

    // Apply saved settings
    async function applySavedSettings() {
        // Get settings and API keys from database
        const settings = await Database.getSettings();
        const apiKeys = await Database.getApiKeys();
        const syncSettings = await Database.getSyncSettings();
        
        // Apply theme setting
        const theme = settings.theme || 'system';
        applyTheme(theme);
        $themeSelect.val(theme);
        
        // Set animation toggle
        $('#animationsToggle').prop('checked', settings.enableAnimations !== false);
        
        // Set preference toggles
        const floatingBtnState = await Database.getFloatingButtonState();
        $('#floatingButtonToggle').prop('checked', floatingBtnState.enabled);
        $('#autoContextToggle').prop('checked', settings.autoLoadContext !== false);
        $('#notificationsToggle').prop('checked', settings.enableNotifications !== false);
        
        // Update floating button icon to reflect current state
        updateFloatingButtonIcon(floatingBtnState.enabled);

        // Set the saved API keys in the input fields
        if (apiKeys) {
            if (apiKeys.openai) $('#openAIKey').val(apiKeys.openai).prop('type', 'password');
            if (apiKeys.gemini) $('#geminiKey').val(apiKeys.gemini).prop('type', 'password');
            if (apiKeys.anthropic) $('#anthropicKey').val(apiKeys.anthropic).prop('type', 'password');
            if (apiKeys.xai) $('#xaiKey').val(apiKeys.xai).prop('type', 'password');
            if (apiKeys.deepseek) $('#deepseekKey').val(apiKeys.deepseek).prop('type', 'password');
        }

        // Update the model dropdown based on available API keys
        updateModelDropdownAvailability(apiKeys);

        // Set the saved model in the dropdown
        const model = settings.model || 'gpt-3.5-turbo';
        $('#modelSelect').val(model);
        
        // Set sync settings
        $('#enableSyncToggle').prop('checked', syncSettings.enabled || false);
        $('#autoSyncToggle').prop('checked', syncSettings.autoSync || false);
        $('#sync-interval').val(syncSettings.syncInterval || '5');
        
        // Show/hide sync sections based on enabled state
        toggleSyncSections(syncSettings.enabled || false);
        
        // Update last synced time if available
        if (syncSettings.lastSynced) {
            $('#last-synced-container').show();
            $('#last-synced-time').text(formatDate(new Date(syncSettings.lastSynced)));
        }
        
        // Check authentication status and update UI
        await checkAuthStatus();
        
        // Check and display cloud sync status
        updateSyncStatus();
    }

    // Initialize
    initPopup().then(setupEventListeners);
    
    // Set up periodic sync check (every 5 minutes)
    setInterval(updateSyncStatus, 5 * 60 * 1000);
});