// background.js - Service Worker (Manifest V3)
// Import database.js module
importScripts('js/dexie.min.js', 'js/database.js');

// Initialize context menu
chrome.runtime.onInstalled.addListener(() => {
    // Create right-click context menu
    chrome.contextMenus.create({
        id: "askAI",
        title: "Ask CoTaskAI",
        contexts: ["selection"]
    });

    // Initialize database with default values
    Database.initialize().catch(err => {
        console.error('Failed to initialize database:', err);
    });
});

// Context menu click handler
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "askAI" && info.selectionText) {
        if (tab && tab.id) {
            handleAIContextMenuRequest(info.selectionText, tab.id);
        } else {
            console.error("No tab information available!");
        }
    }
});

// Handle AI context menu requests
async function handleAIContextMenuRequest(selectedText, tabId) {
    try {
        // Get settings and API keys from database
        const settings = await Database.getSettings();
        const apiKeys = await Database.getApiKeys();
        const modelProvider = getModelProvider(settings.model);
        
        // Get the appropriate API key based on the model provider
        let apiKey;
        switch (modelProvider) {
            case 'gemini':
                apiKey = apiKeys.gemini;
                break;
            case 'anthropic':
                apiKey = apiKeys.anthropic;
                break;
            case 'xai':
                apiKey = apiKeys.xai;
                break;
            case 'deepseek':
                apiKey = apiKeys.deepseek;
                break;
            case 'openai':
            default:
                apiKey = apiKeys.openai;
                break;
        }

        if (!apiKey) {
            chrome.notifications.create({
                type: 'basic',
                iconUrl: 'images/icon.png',
                title: `${modelProvider.toUpperCase()} API Key Missing`,
                message: `Please set your ${modelProvider.toUpperCase()} API key in the settings`
            });
            return;
        }

        let answer;
        
        // Handle API request based on the provider
        if (modelProvider === 'gemini') {
            // Use Gemini API
            const endpoint = `https://generativelanguage.googleapis.com/v1/models/${settings.model}:generateContent`;
            
            const response = await fetch(`${endpoint}?key=${apiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: `Analyze this text: ${selectedText}`
                        }]
                    }]
                })
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || 'Gemini API request failed');
            }
            
            const data = await response.json();
            answer = data.candidates[0].content.parts[0].text;
        } else {
            // Default to OpenAI
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: settings.model,
                    messages: [{
                        role: "user",
                        content: `Analyze this text: ${selectedText}`
                    }]
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || 'OpenAI API request failed');
            }
            
            const data = await response.json();
            answer = data.choices[0].message.content;
        }

        // Send response back to content script
        chrome.tabs.sendMessage(tabId, {
            action: "showAIResponse",
            response: answer
        });

    } catch (error) {
        console.error('AI request failed:', error);
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'images/icon.png',
            title: 'AI Request Failed',
            message: error.message
        });
    }
}

// Handle messages from other parts of the extension
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.action) {
        case 'get_api_response':
            handleChatAPIRequest(request.query, request.context)
                .then(response => sendResponse({ response }))
                .catch(error => sendResponse({ error: error.message }));
            return true; // Keep the message channel open for async response

        case 'save_conversation':
            // Use Dexie.js to save conversation
            Database.saveConversation(request.data)
                .then(() => sendResponse({ success: true }))
                .catch(error => sendResponse({ error: error.message }));
            return true;

        case 'get_conversations':
            // Get conversations for specific URL if provided, otherwise get all
            const getConvPromise = request.url ? 
                Database.getConversations(request.url) :
                Database.getAllConversations();
            
            getConvPromise
                .then(conversations => sendResponse({ conversations }))
                .catch(error => sendResponse({ error: error.message }));
            return true;

        case 'clear_conversations':
            Database.clearConversations()
                .then(() => sendResponse({ success: true }))
                .catch(error => sendResponse({ error: error.message }));
            return true;
            
        case 'toggle_floating_button':
            // Toggle the floating button state in database
            const togglePromise = async () => {
                const state = await Database.getFloatingButtonState();
                const newState = request.forceState !== undefined ? 
                    request.forceState : !state.enabled;
                
                await Database.setFloatingButtonState(newState);
                
                // Send message to content script to update button visibility
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    if (tabs[0]?.id) {
                        chrome.tabs.sendMessage(tabs[0].id, {
                            action: 'toggleFloatingButton',
                            visible: newState
                        });
                    }
                });
                
                return newState;
            };
            
            togglePromise()
                .then(newState => sendResponse({ success: true, enabled: newState }))
                .catch(error => sendResponse({ error: error.message }));
            return true;
            
        case 'get_floating_button_state':
            Database.getFloatingButtonState()
                .then(state => sendResponse({ 
                    success: true, 
                    enabled: state.enabled
                }))
                .catch(error => sendResponse({ error: error.message }));
            return true;
            
        case 'get_floating_button_position':
            Database.getFloatingButtonPosition()
                .then(position => sendResponse({
                    success: true,
                    position
                }))
                .catch(error => sendResponse({ error: error.message }));
            return true;
            
        case 'save_floating_button_position':
            Database.saveFloatingButtonPosition(request.position)
                .then(() => sendResponse({ success: true }))
                .catch(error => sendResponse({ error: error.message }));
            return true;
            
        case 'notify_iframe_loaded':
            // Handle notification from content script that iframe has loaded
            // Send a message to all extension pages (including popups)
            chrome.runtime.sendMessage({
                action: 'floating_modal_opened'
            }).catch(err => {
                // Suppress errors if no listeners are available
                console.log('Notified extension pages about floating modal open');
            });
            sendResponse({ success: true });
            return true;
    }
});

// Helper function to determine the provider for a given model
function getModelProvider(modelName) {
    if (modelName.startsWith('gpt-') || modelName.startsWith('o1-') || modelName.startsWith('o3-')) {
        return 'openai';
    } else if (modelName.startsWith('gemini-')) {
        return 'gemini';
    } else if (modelName.startsWith('claude-')) {
        return 'anthropic';
    } else if (modelName.startsWith('deepseek-')) {
        return 'deepseek';
    } else if (modelName.startsWith('grok-')) {
        return 'xai';
    }
    // Default to OpenAI if unknown
    return 'openai';
}

// Handle chat API requests from popup
async function handleChatAPIRequest(query, context) {
    // Get settings from database
    const settings = await Database.getSettings();
    const apiKeys = await Database.getApiKeys();
    const modelProvider = getModelProvider(settings.model);
    
    // Get the appropriate API key based on the model provider
    let apiKey;
    switch (modelProvider) {
        case 'gemini':
            apiKey = apiKeys.gemini;
            break;
        case 'anthropic':
            apiKey = apiKeys.anthropic;
            break;
        case 'xai':
            apiKey = apiKeys.xai;
            break;
        case 'deepseek':
            apiKey = apiKeys.deepseek;
            break;
        case 'openai':
        default:
            apiKey = apiKeys.openai;
            break;
    }

    if (!apiKey) {
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'images/icon.png',
            title: `${modelProvider.toUpperCase()} API Key Missing`,
            message: `Please set your ${modelProvider.toUpperCase()} API key in the settings`
        });
        throw new Error(`${modelProvider} API key not configured`);
    }

    // Handle API request based on the provider
    if (modelProvider === 'gemini') {
        return await handleGeminiRequest(apiKey, settings.model, query, context);
    } else {
        // Default to OpenAI for now
        return await handleOpenAIRequest(apiKey, settings.model, query, context);
    }
}

// Handle OpenAI API requests
async function handleOpenAIRequest(apiKey, model, query, context) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: model,
            messages: [{
                role: "user",
                content: `Context: ${context}\n\nQuestion: ${query}\n\nMake sure responses are presented in well paragraphy format.`
            }]
        })
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'OpenAI API request failed');
    }

    const data = await response.json();
    return data.choices[0].message.content;
}

// Handle Gemini API requests
async function handleGeminiRequest(apiKey, model, query, context) {
    // Use Gemini API v1 endpoint
    const endpoint = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent`;
    
    const response = await fetch(`${endpoint}?key=${apiKey}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            contents: [{
                parts: [{
                    text: `Context: ${context}\n\nQuestion: ${query}\n\nMake sure responses are presented in well paragraphy format.`
                }]
            }]
        })
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Gemini API request failed');
    }

    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
}

console.log("CoTaskAI background script running");