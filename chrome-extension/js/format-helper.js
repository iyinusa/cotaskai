// Deep formatting to include bulleting
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
    text = text.replace(/```([\s\S]*?)```/g, function (match, codeContent) {
        // Extract language if specified
        let language = '';
        const firstLine = codeContent.trim().split('\n')[0];
        let processedCode = codeContent;

        // Check if the first line specifies a language
        if (firstLine && !firstLine.includes(' ') && firstLine.length < 20) {
            language = firstLine;
            processedCode = codeContent.substring(firstLine.length).trim();
        }

        // Format code with proper line breaks for certain statements
        processedCode = formatCodeWithProperLineBreaks(processedCode);

        // Escape HTML in code blocks
        processedCode = processedCode
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');

        // Add line numbers to the code
        const lines = processedCode.split('\n');
        let numberedCode = '';

        // Process each line with proper line breaks for display
        lines.forEach((line, index) => {
            numberedCode += `<span class="line-number">${index + 1}</span>${line}${index < lines.length - 1 ? '\n' : ''}`;
        });

        // Map common language shortcuts to their Prism.js language identifier
        const languageMap = {
            'js': 'javascript',
            'ts': 'typescript',
            'py': 'python',
            'rb': 'ruby',
            'cs': 'csharp',
            'cpp': 'cpp',
            'php': 'php',
            'go': 'go',
            'rust': 'rust',
            'java': 'java',
            'sh': 'bash',
            'bash': 'bash',
            'html': 'html',
            'css': 'css',
            'json': 'json',
            'yaml': 'yaml',
            'yml': 'yaml',
            'md': 'markdown',
            'sql': 'sql'
        };

        // Get proper language display name and class
        const languageClass = language ? `language-${language in languageMap ? languageMap[language] : language}` : '';
        const displayLang = language ? (language in languageMap ? languageMap[language] : language) : 'plaintext';

        return `<div class="code-block-container">
            <div class="code-header clearfix">
                <span class="copy-code-btn pull-right">
                    Copy
                </span>
                <span class="code-language">${displayLang}</span>
            </div>
            <pre class="code-block line-numbers"><code class="${languageClass}">${processedCode}</code></pre>
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

    // Process markdown tables
    // This regex finds table blocks with pipe-separated content
    const tableRegex = /^\|(.+)\|\s*\n\|[-:\s|]+\|\s*\n(\|.+\|\s*\n)+/gm;

    text = text.replace(tableRegex, function (tableBlock) {
        // Split the table into rows
        const rows = tableBlock.trim().split('\n');

        // Extract header row and alignment row
        const headerRow = rows[0];
        const alignmentRow = rows[1];
        const dataRows = rows.slice(2);

        // Process header cells
        const headerCells = headerRow.split('|').slice(1, -1).map(cell => cell.trim());

        // Determine column alignments from the alignment row
        // (default left, :--: for center, --: for right)
        const alignments = alignmentRow.split('|').slice(1, -1).map(cell => {
            cell = cell.trim();
            if (cell.startsWith(':') && cell.endsWith(':')) return 'center';
            if (cell.endsWith(':')) return 'right';
            return 'left';
        });

        // Start building the HTML table
        let tableHTML = '<div class="table-container"><table class="ai-table">';

        // Build the header
        tableHTML += '<thead><tr>';
        headerCells.forEach((cell, index) => {
            const alignment = alignments[index] || 'left';
            tableHTML += `<th style="text-align: ${alignment}">${cell}</th>`;
        });
        tableHTML += '</tr></thead>';

        // Build the body
        tableHTML += '<tbody>';
        dataRows.forEach(row => {
            const cells = row.split('|').slice(1, -1).map(cell => cell.trim());
            tableHTML += '<tr>';
            cells.forEach((cell, index) => {
                const alignment = alignments[index] || 'left';
                tableHTML += `<td style="text-align: ${alignment}">${cell}</td>`;
            });
            tableHTML += '</tr>';
        });
        tableHTML += '</tbody>';

        // Close the table
        tableHTML += '</table></div>';

        return tableHTML;
    });

    // Handle paragraph breaks (two or more consecutive newlines) and single line breaks
    // This improves text formatting by distinguishing between paragraphs and line breaks
    // text = text.replace(/\n{2,}/g, '</p><p>');  // Convert 2+ consecutive newlines to paragraph breaks
    text = text.replace(/\n/g, '<br>');         // Convert remaining single newlines to <br>
    
    // Remove excessive <br> tags (more than one in a row)
    text = text.replace(/(<br\s*\/?>\s*){2,}/gi, '<br>');
    
    // Fix any raw br tags that might be in the text
    text = text.replace(/<br\/>/g, '<br>');
    
    // Wrap the entire content in paragraph tags if not already wrapped
    if (!text.startsWith('<p>') && !text.startsWith('<h') && !text.startsWith('<ul') && 
        !text.startsWith('<ol') && !text.startsWith('<blockquote') && !text.startsWith('<div')) {
        text = '<p>' + text + '</p>';
    }

    return text;
}

/**
 * Format code with proper line breaks for certain statements
 * This helps fix issues with import statements and other code that should be on separate lines
 * @param {string} code - The code to format
 * @returns {string} - Formatted code
 */
function formatCodeWithProperLineBreaks(code) {
    // Handle import statements joined by semicolons
    code = code.replace(/;(import|const|let|var|function|class)\s/g, ';\n$1 ');
    
    // Handle missing line breaks after semicolons in general (but avoid breaking within for loops)
    code = code.replace(/;(?!\s*(?:for|while)\s*\()\s+(?![\]})])/g, ';\n');
    
    // Add line breaks after braces if there's content after them 
    // (but careful not to add breaks within object definitions)
    code = code.replace(/}(?!\s*(?:[,;]|\)|\n|\s+else|\s*\}))/g, '}\n');
    
    return code;
}

/**
 * Copy code to clipboard
 * @param {HTMLElement} button - The button that was clicked
 */
function copyToClipboard(button) {
    try {
        // Find the code element - navigate from button to code block
        const codeBlock = button.parentNode.nextElementSibling.querySelector('code');
        if (!codeBlock) {
            console.error('Could not find code element');
            return;
        }

        // Get original code text (without line numbers formatting)
        let codeText = '';
        // Use textContent to get the actual text including line breaks
        codeText = codeBlock.textContent || '';

        // Copy to clipboard
        navigator.clipboard.writeText(codeText).then(() => {
            // Change button text to indicate success
            const originalText = button.textContent;
            button.textContent = 'Copied';
            button.classList.add('copied');

            // Reset button text after a delay
            setTimeout(() => {
                button.textContent = originalText;
                button.classList.remove('copied');
            }, 1500);
        }).catch(err => {
            console.error('Failed to copy text: ', err);
            // Fallback for browsers that don't support clipboard API
            fallbackCopyTextToClipboard(codeText, button);
        });
    } catch (error) {
        console.error('Error in copy function:', error);
    }
}

/**
 * Fallback method for copying text to clipboard
 * @param {string} text - Text to copy
 * @param {HTMLElement} button - Button element
 */
function fallbackCopyTextToClipboard(text, button) {
    const textArea = document.createElement('textarea');
    textArea.value = text;

    // Make the textarea out of viewport
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    try {
        document.execCommand('copy');
        // Update button to show successful copy
        const originalText = button.textContent;
        button.textContent = 'Copied';
        button.classList.add('copied');

        // Reset button text after a delay
        setTimeout(() => {
            button.textContent = originalText;
            button.classList.remove('copied');
        }, 1500);
    } catch (err) {
        console.error('Fallback: Oops, unable to copy', err);
    }

    document.body.removeChild(textArea);
}

/**
 * Apply syntax highlighting to code blocks
 * Should be called after the HTML content is inserted into the DOM
 */
function applyPrismSyntaxHighlighting() {
    // Check if Prism is available
    if (typeof Prism !== 'undefined') {
        // Find all code blocks that haven't been highlighted yet
        document.querySelectorAll('pre code').forEach((block) => {
            if (!block.classList.contains('prism-highlighted')) {
                // Store the original formatted text with preserved line breaks
                const originalCode = block.innerHTML;
                
                // Apply Prism highlighting
                Prism.highlightElement(block);
                
                // Mark as highlighted to avoid re-processing
                block.classList.add('prism-highlighted');
                
                // Ensure line numbers remain properly aligned after highlighting
                fixLineNumberAlignment(block);
            }
        });
    }
}

/**
 * Fix line number alignment after Prism highlighting
 * @param {HTMLElement} codeBlock - The code block element to fix
 */
function fixLineNumberAlignment(codeBlock) {
    // Get all line number spans
    const lineNumberSpans = codeBlock.querySelectorAll('span.line-number');
    if (!lineNumberSpans.length) return;
    
    // Get the code content and split it by line
    const codeLines = codeBlock.textContent.split('\n');
    
    // Create a new container for our properly formatted code
    const fragment = document.createDocumentFragment();
    
    // Process each line, associating it with line numbers and preserving formatting
    codeLines.forEach((line, index) => {
        if (index < lineNumberSpans.length) {
            // Clone the line number span
            const lineNumberSpan = lineNumberSpans[index].cloneNode(true);
            fragment.appendChild(lineNumberSpan);
            
            // Create a span for the highlighted code content
            const highlightedLine = document.createElement('span');
            highlightedLine.className = 'code-line';
            highlightedLine.innerHTML = line;
            fragment.appendChild(highlightedLine);
            
            // Add line break if not last line
            if (index < codeLines.length - 1) {
                fragment.appendChild(document.createTextNode('\n'));
            }
        }
    });
    
    // Replace code block content with our properly formatted version
    codeBlock.innerHTML = '';
    codeBlock.appendChild(fragment);
}

/**
 * Setup event listeners for code copy buttons
 * Should be called after the HTML content is inserted into the DOM
 */
function setupCodeCopyButtons() {
    // Find all copy code buttons
    document.querySelectorAll('.copy-code-btn').forEach(button => {
        // Remove existing listener if any to avoid duplicates
        button.removeEventListener('click', copyButtonClickHandler);
        // Add click event listener
        button.addEventListener('click', copyButtonClickHandler);
    });
}

/**
 * Handle click events for code copy buttons
 * @param {Event} event - The click event
 */
function copyButtonClickHandler(event) {
    copyToClipboard(event.currentTarget);
}

// When DOM is loaded, ensure code blocks formatting is handled
document.addEventListener('DOMContentLoaded', () => {
    // Setup initial copy buttons
    setupCodeCopyButtons();
});

// Call this function whenever new content is added to the page
function setupCodeFormatting() {
    applyPrismSyntaxHighlighting();
    setupCodeCopyButtons();
}