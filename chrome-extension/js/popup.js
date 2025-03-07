$(document).ready(() => {
    const $modelThinking = $('#modelThinking');
    const $userInput = $('#prompt');
    const $chatHistory = $('#chat-history');
    const $tabPanes = $('.tab-pane');
    const $tabLinks = $('.tablinks');

    // Auto-resize function
    const autoResize = (elem) => {
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

                await chrome.storage.local.set({ pageContent: fullText });
            } else {
                const results = await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: () => document.body.innerText
                });
                await chrome.storage.local.set({ pageContent: results[0].result });
            }
        } catch (error) {
            displayMessage(`Content Error: ${error.message}`, 'error');
        }
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

        // Listen for tab changes
        $tabLinks.on('click', function () {
            const clickedTab = $(this).find('a').attr('href');

            $tabLinks.removeClass('active');
            $(this).addClass('active');
            
           $tabPanes.removeClass('active');
            $(clickedTab).addClass('active');
        });

        // Save data changes handler in settings tab
        $('#save-settings').on('click', () => {
            const key = $('#openAIKey').val().trim();
            chrome.storage.local.set({ apiKey: key }, () => {
                console.log('openAIKey saved successfully!');
            });
        });

        // Listen for changes on the model selection dropdown
        $('#modelSelect').on('change', () => {
            const selectedModel = $('#modelSelect').val();
            chrome.storage.local.get('settings', ({ settings }) => {
                const updatedSettings = Object.assign({}, settings, {
                    model: selectedModel
                });
                chrome.storage.local.set({ settings: updatedSettings }, () => {
                    console.log('Model updated to:', selectedModel);
                });
            });
        });
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
            const { pageContent = '' } = await chrome.storage.local.get(['pageContent']);

            // Get active tab info to save along with the conversation
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

            const resp = await chrome.runtime.sendMessage({
                action: 'get_api_response',
                query: userInput,
                context: `${pageContent}`.trim()
            });

            if (resp.error) throw new Error(resp.error);

            // Animate AI message
            displayMessageAnimated(resp.response, 'response');

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
            // showLoadingState(false);
            stopModelThinkingAnimation();
        }
    };
    
    // Load previous conversations
    async function loadConversations() {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const { conversations } = await chrome.storage.local.get('conversations');
        
        // Filter conversations to only those matching the active tab's url
        const filteredConversations = conversations.filter(convo => convo.tabUrl === tab.url);

        if (filteredConversations.length === 0) {
            // Display a centered message when no conversations are present
            $chatHistory.append(`
                <div class="empty-message text-center">
                    <div><img alt="CoTaskAI" src="images/icon.png" /></div>
                    <p>Start a dialogue with the Website or PDF document.</p>
                    <div class="disclaimer text-muted">
                        CoTaskAI helps you analyze text from the current page, and provide responses based on the context. Please note that you might be limited by the number of requests/token you can make to the AI service, depending on your selected model.
                    </div>
                </div>
            `);
        } else {
            // Iterate over the filtered conversations array to display each conversation sequentially
            filteredConversations.forEach(converse => {
                if (converse.query) displayMessage(converse.query, 'prompt');
                if (converse.response) displayMessage(converse.response, 'response');
            });
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
        `).scrollTop($chatHistory[0].scrollHeight);
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
            $chatHistory.scrollTop($chatHistory[0].scrollHeight);

            if (index > fullText.length) {
                clearInterval(interval);
                
                // Ensure final scroll
                $chatHistory.scrollTop($chatHistory[0].scrollHeight);
            }
        }, 20); 
    };

    // Start thinking animation
    function startModelThinkingAnimation() {
        const modelThinking = document.getElementById('modelThinking');
        modelThinking.style.display = 'block';
        let dotCount = 0;
        const maxDots = 3;
        modelThinking.textContent = 'Thinking';
        window.thinkingInterval = setInterval(() => {
            dotCount = (dotCount + 1) % (maxDots + 1);
            modelThinking.textContent = 'Thinking' + '.'.repeat(dotCount);
        }, 500); // Adjust delay as desired (milliseconds)
    }

    // Stop thinking animation
    function stopModelThinkingAnimation() {
        clearInterval(window.thinkingInterval);
        const modelThinking = document.getElementById('modelThinking');
        modelThinking.style.display = 'none';
    }

    // Apply saved settings
    async function applySavedSettings() {
        const { settings, apiKey } = await chrome.storage.local.get(['settings', 'apiKey']);

        // Apply dark mode setting
        if (settings?.darkMode) {
            document.body.classList.add('dark-mode');
        }

        // Set the saved API key in the input field, and mask it to protect privacy
        if (apiKey) {
            $('#openAIKey').val(apiKey).prop('type', 'password');
        }

        // Set the saved model in the dropdown; default to GPT-3.5 Turbo if not set
        const model = settings?.model || 'gpt-3.5-turbo';
        $('#modelSelect').val(model);
    }


    // Initialize
    initPopup().then(setupEventListeners);
});