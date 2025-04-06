// Deep formating to include bulleting
function deepFormating(text) {
    const lines = text.split('\n');
    let result = "";
    let inList = false;

    lines.forEach((line, index) => {
        if (/^\s*([-*+])\s+/.test(line)) {
            if (!inList) {
                result += "<ul>";
                inList = true;
            }
            result += `<li>${line.replace(/^\s*([-*+])\s+/, '')}</li>`;
        } else {
            if (inList) {
                result += "</ul>";
                inList = false;
            }
            result += line;
            if (index < lines.length - 1) {
                result += "<br>";  // add a line break for non-list lines
            }
        }
    });

    if (inList) result += "</ul>";
    return result;
}

/**
 * Format response text with proper styling for code blocks and other elements
 * @param {string} text - The text to format
 * @returns {string} - Formatted HTML
 */
function formatResponseText(text) {
    if (!text) return '';

    // Process code blocks with triple backticks
    text = text.replace(/```([\s\S]*?)```/g, function(match, codeContent) {
        // Extract language if specified
        let language = '';
        const firstLine = codeContent.trim().split('\n')[0];
        let processedCode = codeContent;

        if (firstLine && !firstLine.includes(' ') && firstLine.length < 20) {
            language = firstLine;
            processedCode = codeContent.substring(firstLine.length).trim();
        }

        // Escape HTML in code blocks
        processedCode = processedCode
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');

        // Add syntax highlighting classes based on the language
        if (language) {
            const languageClass = `language-${language}`;
            return `
                <div class="code-block-container">
                    <div class="code-header">
                        <span class="code-language">${language}</span>
                        <button class="copy-code-btn" onclick="copyToClipboard(this)">Copy</button>
                    </div>
                    <pre class="code-block ${languageClass}"><code>${processedCode}</code></pre>
                </div>`;
        }

        return `
            <div class="code-block-container">
                <div class="code-header">
                    <span class="code-language">code</span>
                    <button class="copy-code-btn" onclick="copyToClipboard(this)">Copy</button>
                </div>
                <pre class="code-block"><code>${processedCode}</code></pre>
            </div>`;
    });

    // Process inline code
    text = text.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

    // Process links
    text = text.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="ai-link">$1</a>');

    // Process formatting
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');

    // Process lists
    text = text.replace(/^[\s]*[-*][\s]+(.*?)$/gm, '<li>$1</li>');
    text = text.replace(/(<li>.*?<\/li>)\s+(?=<li>)/gs, '$1');
    text = text.replace(/(<li>.*?<\/li>)+/gs, '<ul class="ai-list">$&</ul>');

    // Process ordered lists
    text = text.replace(/^[\s]*(\d+)\.[\s]+(.*?)$/gm, '<li>$2</li>');
    text = text.replace(/(<li>.*?<\/li>)\s+(?=<li>)/gs, '$1');
    text = text.replace(/(<li>.*?<\/li>)+/gs, '<ol class="ai-list">$&</ol>');

    // Process headings
    text = text.replace(/^#{6}\s+(.*?)$/gm, '<h6>$1</h6>');
    text = text.replace(/^#{5}\s+(.*?)$/gm, '<h5>$1</h5>');
    text = text.replace(/^#{4}\s+(.*?)$/gm, '<h4>$1</h4>');
    text = text.replace(/^#{3}\s+(.*?)$/gm, '<h3>$1</h3>');
    text = text.replace(/^#{2}\s+(.*?)$/gm, '<h2>$1</h2>');
    text = text.replace(/^#{1}\s+(.*?)$/gm, '<h1>$1</h1>');

    // Process blockquotes
    text = text.replace(/^>\s+(.*?)$/gm, '<blockquote>$1</blockquote>');

    // Convert newlines to <br> for remaining text
    text = text.replace(/\n/g, '<br>');

    return text;
}

/**
 * Copy code to clipboard
 * @param {HTMLElement} button - The button that was clicked
 */
function copyToClipboard(button) {
    const codeBlock = button.parentElement.nextElementSibling;
    const codeText = codeBlock.textContent || '';
    
    navigator.clipboard.writeText(codeText).then(() => {
        // Change button text to indicate success
        const originalText = button.textContent;
        button.textContent = 'Copied!';
        button.classList.add('copied');
        
        // Reset button text after a delay
        setTimeout(() => {
            button.textContent = originalText;
            button.classList.remove('copied');
        }, 1500);
    }).catch(err => {
        console.error('Failed to copy text: ', err);
    });
}