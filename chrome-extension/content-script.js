(() => {
    const getPageContent = () => $('body').text();

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "getContent") {
            sendResponse({ content: getPageContent() });
        }
        return true;
    });

    // Content script for handling AI responses in the page context
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "showAIResponse") {
            // Show AI response in a floating toast
            const toast = document.createElement('div');
            toast.style.position = 'fixed';
            toast.style.bottom = '20px';
            toast.style.right = '20px';
            toast.style.backgroundColor = '#fff';
            toast.style.color = '#333';
            toast.style.padding = '15px 20px';
            toast.style.borderRadius = '8px';
            toast.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
            toast.style.zIndex = '1000000';
            toast.style.maxWidth = '350px';
            toast.style.maxHeight = '400px';
            toast.style.overflow = 'auto';
            toast.style.transition = 'opacity 0.3s ease';
            toast.style.fontSize = '14px';
            toast.style.lineHeight = '1.5';
            toast.style.border = '1px solid #eaeaea';
            
            // Title
            const title = document.createElement('div');
            title.textContent = 'CoTaskAI Response';
            title.style.fontWeight = 'bold';
            title.style.marginBottom = '8px';
            title.style.borderBottom = '1px solid #eaeaea';
            title.style.paddingBottom = '8px';
            toast.appendChild(title);
            
            // Content
            const content = document.createElement('div');
            content.textContent = request.response;
            toast.appendChild(content);
            
            // Close button
            const closeButton = document.createElement('div');
            closeButton.textContent = '×';
            closeButton.style.position = 'absolute';
            closeButton.style.top = '10px';
            closeButton.style.right = '10px';
            closeButton.style.cursor = 'pointer';
            closeButton.style.fontSize = '18px';
            closeButton.style.fontWeight = 'bold';
            closeButton.style.lineHeight = '1';
            
            closeButton.addEventListener('click', () => {
                document.body.removeChild(toast);
            });
            
            toast.appendChild(closeButton);
            
            // Auto dismiss after 30 seconds
            setTimeout(() => {
                if (document.body.contains(toast)) {
                    toast.style.opacity = '0';
                    setTimeout(() => {
                        if (document.body.contains(toast)) {
                            document.body.removeChild(toast);
                        }
                    }, 300);
                }
            }, 30000);
            
            document.body.appendChild(toast);
        }
    });
})();