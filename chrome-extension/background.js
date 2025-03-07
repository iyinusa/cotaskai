// background.js - Service Worker (Manifest V3)

// Initialize context menu
chrome.runtime.onInstalled.addListener(() => {
    // Create right-click context menu
    chrome.contextMenus.create({
        id: "askAI",
        title: "Ask CoTaskAI",
        contexts: ["selection"]
    });

    // Set default storage values
    chrome.storage.local.set({
        conversations: [],
        apiKey: '',
        settings: {
            darkMode: false,
            model: 'gpt-3.5-turbo'
        }
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
        const { apiKey, settings } = await chrome.storage.local.get(['apiKey', 'settings']);

        if (!apiKey) {
            chrome.notifications.create({
                type: 'basic',
                iconUrl: 'images/icon.png',
                title: 'API Key Missing',
                message: 'Please set your API key in the settings'
            });
            return;
        }

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

        const data = await response.json();
        const answer = data.choices[0].message.content;

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
            chrome.storage.local.get(['conversations'], ({ conversations }) => {
                const updatedConversations = [...conversations, request.data];
                chrome.storage.local.set({ conversations: updatedConversations });
            });
            break;

        case 'get_conversations':
            chrome.storage.local.get(['conversations'], ({ conversations }) => {
                sendResponse(conversations);
            });
            return true;

        case 'clear_conversations':
            chrome.storage.local.set({ conversations: [] });
            break;
    }
});

// Handle chat API requests from popup
async function handleChatAPIRequest(query, context) {
    const { apiKey, settings } = await chrome.storage.local.get(['apiKey', 'settings']);

    if (!apiKey) {
        // throw new Error('API key not configured');
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'images/icon.png',
            title: 'API Key Missing',
            message: 'Please set your API key in the settings'
        });
    }

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
                content: `Context: ${context}\n\nQuestion: ${query}\n\nMake sure responses are presented in well paragraphy format.`
            }]
        })
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'API request failed');
    }

    const data = await response.json();
    return data.choices[0].message.content;
}

// Handle storage changes
chrome.storage.onChanged.addListener((changes) => {
    if (changes.apiKey) {
        console.log('API key was updated');
    }
});

console.log("CoTaskAI background script running");