// background.js - Service Worker (Manifest V3)
// Import scripts with proper error handling and fallbacks
try {
    // First load Dexie which is required
    importScripts('js/dexie.min.js');
    console.log("Dexie loaded successfully");
    
    // Make Dexie available globally in the service worker
    if (!self.Dexie) {
        self.Dexie = Dexie;
        console.log("Dexie attached to global scope");
    }

    // Try to load Dexie Cloud addon
    try {
        importScripts('js/dexie-cloud-addon.min.js');
        console.log("Dexie Cloud addon loaded successfully");
        
        // Make dexieCloud available globally in the service worker
        if (typeof dexieCloud !== 'undefined') {
            self.dexieCloud = dexieCloud;
            console.log("dexieCloud attached to global scope");
        } else {
            console.warn("dexieCloud variable not defined after loading addon");
        }
    } catch (cloudError) {
        console.warn("Dexie Cloud import failed:", cloudError.message);
        // Continue without cloud functionality
    }

    // Now import database.js which depends on the above
    importScripts('js/database.js');
    console.log("Database.js loaded successfully");
    
    // Verify Database was properly loaded
    if (typeof Database === 'undefined') {
        throw new Error("Database object not defined after loading database.js");
    }
    
    // Initialize database after a small delay to ensure everything is loaded
    setTimeout(() => {
        if (Database && typeof Database.initialize === 'function') {
            Database.initialize()
                .then(result => {
                    if (result && result.success) {
                        console.log("Database initialized successfully");
                    } else {
                        console.error("Database initialization returned failure", result);
                    }
                })
                .catch(err => {
                    console.error('Failed to initialize database:', err);
                });
        } else {
            console.error("Database or Database.initialize is not available");
        }
    }, 100);
    
} catch (error) {
    console.error("Critical error importing scripts:", error);
    // Report the error so it's easier to debug
    try {
        chrome.runtime.sendMessage({
            action: 'service_worker_error',
            error: error.message || 'Unknown error loading service worker scripts'
        }).catch(() => {
            // Suppress errors if no listeners
        });
    } catch (e) {
        console.error("Could not send error message", e);
    }
}

// Initialize context menu
chrome.runtime.onInstalled.addListener(() => {
    // Create right-click context menu
    // chrome.contextMenus.create({
    //     id: "askAI",
    //     title: "Ask CoTaskAI",
    //     contexts: ["selection"]
    // });
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

// Handle AI context menu requests - with safety checks
async function handleAIContextMenuRequest(selectedText, tabId) {
    try {
        // Check if Database is available
        if (!Database) {
            console.error("Database not available");
            chrome.notifications.create({
                type: 'basic',
                iconUrl: 'images/icon.png',
                title: 'Database Error',
                message: 'Database not initialized properly'
            });
            return;
        }

        // Get settings and API keys from database
        const settings = await Database.getSettings();
        const apiKeys = await Database.getApiKeys();
        const modelProvider = getModelProvider(settings.model);

        // Get the appropriate API key based on the model provider
        let apiKey;
        switch (modelProvider) {
            case 'perplexity':
                apiKey = apiKeys.perplexity;
                break;
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
        if (modelProvider === 'perplexity') {
            // Use Perplexity Sonar API
            const endpoint = `https://api.perplexity.ai/chat/completions`;

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: settings.model,
                    messages: [
                        { role: "system", content: "You are a web analysis expert. Search the website and analyze the text." },
                        {role: "user", content: `Analyze this text: ${selectedText}`}
                    ],
                    temperature: 0.1,
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || 'Perplexity API request failed');
            }

            const data = await response.json();
            answer = data.choices[0].message.content;
        } else if (modelProvider === 'gemini') {
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
        } else if (modelProvider === 'anthropic') {
            // Use Anthropic API
            const endpoint = "https://api.anthropic.com/v1/messages";

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                    'anthropic-dangerous-direct-browser-access': 'true'
                },
                body: JSON.stringify({
                    model: settings.model,
                    messages: [
                        {
                            role: "user",
                            content: `Analyze this text: ${selectedText}`
                        }
                    ],
                    max_tokens: 4096
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || 'Anthropic API request failed');
            }

            const data = await response.json();
            answer = data.content[0].text;
        } else if (modelProvider === 'deepseek') {
            // Use DeepSeek API
            const endpoint = "https://api.deepseek.com/v1/chat/completions";

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: settings.model,
                    messages: [
                        {
                            role: "user",
                            content: `Analyze this text: ${selectedText}`
                        }
                    ],
                    temperature: 0.7,
                    max_tokens: 4000
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || 'DeepSeek API request failed');
            }

            const data = await response.json();
            answer = data.choices[0].message.content;
        } else if (modelProvider === 'xai') {
            // Use xAI API
            const endpoint = "https://api.grok.x.ai/v1/chat/completions";

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: settings.model,
                    messages: [
                        {
                            role: "user",
                            content: `Analyze this text: ${selectedText}`
                        }
                    ],
                    temperature: 0.7,
                    max_tokens: 4096
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || 'xAI API request failed');
            }

            const data = await response.json();
            answer = data.choices[0].message.content;
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
            handleChatAPIRequest(request.query, request.context, request.contextType, request.domain)
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
    } else if (modelName.startsWith('sonar-')) {
        return 'perplexity';
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
async function handleChatAPIRequest(query, context, contextType, domain) {
    // Get settings from database
    const settings = await Database.getSettings();
    const apiKeys = await Database.getApiKeys();
    const modelProvider = getModelProvider(settings.model);

    // Get the appropriate API key based on the model provider
    let apiKey;
    switch (modelProvider) {
        case 'perplexity':
            apiKey = apiKeys.perplexity;
            break;
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
    if (modelProvider === 'perplexity') {
        return await handlePerplexityRequest(apiKey, settings.model, query, context, contextType, domain);
    } else if (modelProvider === 'gemini') {
        return await handleGeminiRequest(apiKey, settings.model, query, context);
    } else if (modelProvider === 'anthropic') {
        return await handleAnthropicRequest(apiKey, settings.model, query, context);
    } else if (modelProvider === 'deepseek') {
        return await handleDeepSeekRequest(apiKey, settings.model, query, context);
    } else if (modelProvider === 'xai') {
        return await handleXAIRequest(apiKey, settings.model, query, context);
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
                content: `Context: ${context}\n\nQuestion: ${query}\n\nFormat your response using professional markdown, including appropriate use of headings, bold, italic, lists, code blocks, tables, and other markdown formatting as needed to present the information clearly and professionally.`
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

// Handle Perplexity API requests
async function handlePerplexityRequest(apiKey, model, query, context, contextType, domain) {
    if (contextType === "pdf") {
        // Use Perplexity Sonar API with web content context
        payload = JSON.stringify({
            model: model,
            messages: [
                {
                    role: "system",
                    content: "You are a document synthesizer expert. Search the document content, analyze, and synthesize for the best insights and clarity."
                },
                {
                    role: "user",
                    content: `Search the document content and respond to this enquiry: ${query}\n\nStrict Rules:\n1. Provide only final answer, do not include any processing or thinking step(s).\n2. You must search only the document content and provide the answer based on the context of the document.\n3. Do not search any other sources or websites.\n\nFollow Steps:\n1. Search ONLY the document content provided in "Context" below, no external websites or sources.\n2. Analyze the content to ensure it addresses the query.\n3. Synthesize for the best insights and clarity.\n4. Format your response using professional markdown, including appropriate use of headings, bold, italic, lists, code blocks, tables, and other markdown formatting as needed.\n\nContext:\n${context}`
                }
            ],
        });
    } else {
        // Use Perplexity Sonar API with website deep context contexts
        payload = JSON.stringify({
            model: model,
            messages: [
                {
                    role: "system",
                    content: "You are a web analytic expert. Search the website, analyze, and synthesize for the best insights and clarity."
                },
                {
                    role: "user",
                    content: `Search the website and respond to this enquiry: ${query}\n\nStrict Rules:\n1. Provide only final answer, do not include any processing or thinking step(s).\n2. You must search only the website ${domain} and provide the answer based on the content of the website.\n\nFollow Steps:\n1. Search the website ${domain}, start with the current page content, and if information not found, deep search into other pages of the website.\n2. Analyze the content to ensure it addresses the query.\n3. Synthesize for the best insights and clarity.\n4. Format your response using professional markdown, including appropriate use of headings, bold, italic, lists, code blocks, tables, and other markdown formatting as needed to present the information clearly and professionally.`
                }
            ],
            search_domain_filter: [`${domain}`],
        });
    }

    const response = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: payload
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Perplexity API request failed');
    }

    const data = await response.json();
    var responseText = data.choices[0].message.content;

    // Parse the response text - remove <think> tags and their contents
    responseText = responseText.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

    // Try get and format citations, if exit
    const citations = data.citations;
    if (citations && citations.length > 0) {
        var references = `<p><strong>References:</strong></p>`;
        for (let i = 0; i < citations.length; i++) {
            const citation = citations[i];
            references += `<p style="padding-left:10px;">[${i+1}] <a href="${citation}" target="_blank">${citation}</a></p>`;
        }
        responseText += `\n\n${references}`;
    }
    
    return responseText;
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
                    text: `Context: ${context}\n\nQuestion: ${query}\n\nFormat your response using professional markdown, including appropriate use of headings, bold, italic, lists, code blocks, tables, and other markdown formatting as needed to present the information clearly and professionally.`
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

// Handle Anthropic API requests
async function handleAnthropicRequest(apiKey, model, query, context) {
    // Use Anthropic's Claude API endpoint
    const endpoint = "https://api.anthropic.com/v1/messages";

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true'
        },            body: JSON.stringify({
            model: model,
            messages: [
                {
                    role: "user",
                    content: `Context: ${context}\n\nQuestion: ${query}\n\nFormat your response using professional markdown, including appropriate use of headings, bold, italic, lists, code blocks, tables, and other markdown formatting as needed to present the information clearly and professionally.`
                }
            ],
            max_tokens: 4096
        })
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Anthropic API request failed');
    }

    const data = await response.json();
    return data.content[0].text;
}

// Handle DeepSeek API requests
async function handleDeepSeekRequest(apiKey, model, query, context) {
    // DeepSeek API endpoint
    const endpoint = "https://api.deepseek.com/v1/chat/completions";

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: model,
            messages: [
                {
                    role: "user",
                    content: `Context: ${context}\n\nQuestion: ${query}\n\nMake sure responses are presented in well paragraphy format.`
                }
            ],
            temperature: 0.7,
            max_tokens: 4000
        })
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'DeepSeek API request failed');
    }

    const data = await response.json();
    return data.choices[0].message.content;
}

// Handle xAI API requests
async function handleXAIRequest(apiKey, model, query, context) {
    // xAI Grok API endpoint
    const endpoint = "https://api.grok.x.ai/v1/chat/completions";

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },            body: JSON.stringify({
            model: model,
            messages: [
                {
                    role: "user", 
                    content: `Context: ${context}\n\nQuestion: ${query}\n\nFormat your response using professional markdown, including appropriate use of headings, bold, italic, lists, code blocks, tables, and other markdown formatting as needed to present the information clearly and professionally.`
                }
            ],
            temperature: 0.7,
            max_tokens: 4096
        })
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'xAI API request failed');
    }

    const data = await response.json();
    return data.choices[0].message.content;
}

console.log("CoTaskAI background script running");