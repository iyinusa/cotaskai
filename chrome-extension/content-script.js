(() => {
    const getPageContent = () => $('body').text();

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "getContent") {
            sendResponse({ content: getPageContent() });
        }
        return true;
    });
})();