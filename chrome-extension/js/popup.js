$(document).ready(() => {
    const $modelThinking = $('#modelThinking');
    const $userInput = $('#prompt');
    const $sendBtn = $('#sendBtn');
    const $chatHistory = $('#chat-history');
    const $tabPanes = $('.tab-pane');
    const $tabLinks = $('.tablinks');
    const $settingsModal = $('#settingsModal');
    const $settingsBtn = $('#settingsBtn');
    const $closeSettingsBtn = $('#closeSettingsBtn');
    const $themeToggleBtn = $('#themeToggleBtn');
    const $themeSelect = $('#themeSelect');

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
    };

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
            displayMessage(`Content Error: ${error.message}`, 'error');
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

    // Event handlers
    const setupEventListeners = () => {
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

        // Theme select change
        $themeSelect.on('change', async function() {
            const selectedTheme = $(this).val();
            await Database.updateSettings({ theme: selectedTheme });
            applyTheme(selectedTheme);
        });

        // Save settings handler
        $('#save-settings').on('click', async () => {
            // Collect all API keys
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
            
            // Save settings to database
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
            
            console.log('Settings saved successfully!');
            
            // Close the settings modal after saving
            $settingsModal.removeClass('active');
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
            displayMessageAnimated(resp.response, 'response');

            // Save conversation to database through background script
            await chrome.runtime.sendMessage({
                action: 'save_conversation',
                data: {
                    query: userInput,
                    response: resp.response,
                    timestamp: new Date().toISOString(),
                    tabUrl: tab.url,
                }
            });
        } catch (error) {
            displayMessage(`Error: ${error.message}`, 'error');
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
                    if (converse.query) displayMessage(converse.query, 'prompt');
                    if (converse.response) displayMessage(converse.response, 'response');
                });
            }
        } catch (error) {
            console.error("Error loading conversations:", error);
        }
    }

    // UI function to display message
    const displayMessage = (text, sender) => {
        let formattedText;

        if (sender === 'prompt' || sender === 'response') {
            formattedText = formatResponseText(text);
        } else {
            formattedText = text.replace(/\n/g, '<br>');
        }
        
        $chatHistory.append(`
            <div class="message ${sender}">
                <div class="message-header">${sender.toUpperCase()}</div>
                <div class="message-content">${formattedText}</div>
            </div>
        `);
        
        // Add null check before accessing scrollHeight
        if ($chatHistory[0]) {
            $chatHistory.scrollTop($chatHistory[0].scrollHeight);
        }
    };

    // UI function to animate the AI message letter-by-letter
    const displayMessageAnimated = (text, sender) => {
        const $message = $(`
            <div class="message ${sender}">
                <div class="message-header">${sender.toUpperCase()}</div>
                <div class="message-content"></div>
            </div>
        `);
        $chatHistory.append($message);
        const $content = $message.find('.message-content');
        let fullText = (sender === 'response')
            ? formatResponseText(text)
            : text.replace(/\n/g, '<br>');
        
        let index = 0;

        // Animate by progressively appending one character (note: this simple approach treats HTML tags as text)
        const interval = setInterval(() => {
            // To avoid breaking HTML tags.
            // Here we simply append one character at a time.
            $content.html(fullText.substring(0, index));
            index++;

            // Scroll chat history to bottom on every update
            if ($chatHistory[0]) {
                $chatHistory.scrollTop($chatHistory[0].scrollHeight);
            }

            if (index > fullText.length) {
                clearInterval(interval);
                
                // Ensure final scroll
                if ($chatHistory[0]) {
                    $chatHistory.scrollTop($chatHistory[0].scrollHeight);
                }
            }
        }, 20); 
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

    // Apply saved settings
    async function applySavedSettings() {
        // Get settings and API keys from database
        const settings = await Database.getSettings();
        const apiKeys = await Database.getApiKeys();
        
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

        // Set the saved API keys in the input fields
        if (apiKeys) {
            if (apiKeys.openai) $('#openAIKey').val(apiKeys.openai).prop('type', 'password');
            if (apiKeys.gemini) $('#geminiKey').val(apiKeys.gemini).prop('type', 'password');
            if (apiKeys.anthropic) $('#anthropicKey').val(apiKeys.anthropic).prop('type', 'password');
            if (apiKeys.xai) $('#xaiKey').val(apiKeys.xai).prop('type', 'password');
            if (apiKeys.deepseek) $('#deepseekKey').val(apiKeys.deepseek).prop('type', 'password');
        }

        // Set the saved model in the dropdown
        const model = settings.model || 'gpt-3.5-turbo';
        $('#modelSelect').val(model);
    }

    // Initialize
    initPopup().then(setupEventListeners);
});