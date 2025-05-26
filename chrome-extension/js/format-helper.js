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
    
    // Configure marked.js options for enhanced markdown support
    marked.setOptions({
        renderer: new marked.Renderer(),
        highlight: function(code, lang) {
            // Use Prism.js for syntax highlighting if available
            if (Prism && Prism.languages[lang]) {
                return Prism.highlight(code, Prism.languages[lang], lang);
            }
            return code;
        },
        pedantic: false,
        gfm: true, // GitHub Flavored Markdown
        breaks: true, // Convert line breaks to <br>
        sanitize: false, // Don't sanitize HTML - we control the content
        smartLists: true, // Use smart list behavior
        smartypants: true, // Use smart punctuation like quotes and dashes
        xhtml: false
    });
    
    // Create a custom renderer for enhanced markdown features
    const renderer = new marked.Renderer();
    
    // Enhanced code block rendering with language detection, copy button and line numbers
    renderer.code = function(code, language) {
        // Format code with proper line breaks for certain statements
        code = formatCodeWithProperLineBreaks(code);
        
        // Comprehensive language map for syntax highlighting
        const languageMap = {
            'js': 'javascript',
            'ts': 'typescript',
            'py': 'python',
            'rb': 'ruby',
            'cs': 'csharp',
            'cpp': 'cpp',
            'c++': 'cpp',
            'c': 'c',
            'php': 'php',
            'go': 'go',
            'rust': 'rust',
            'java': 'java',
            'sh': 'bash',
            'bash': 'bash',
            'shell': 'bash',
            'zsh': 'bash',
            'html': 'html',
            'xml': 'xml',
            'css': 'css',
            'scss': 'scss',
            'sass': 'sass',
            'less': 'less',
            'json': 'json',
            'yaml': 'yaml',
            'yml': 'yaml',
            'md': 'markdown',
            'markdown': 'markdown',
            'sql': 'sql',
            'swift': 'swift',
            'kotlin': 'kotlin',
            'dart': 'dart',
            'r': 'r',
            'dockerfile': 'dockerfile',
            'docker': 'dockerfile',
            'plaintext': 'plaintext',
            'text': 'plaintext'
        };
        
        // Get proper language display name and class
        const displayLang = language ? (language.toLowerCase() in languageMap ? languageMap[language.toLowerCase()] : language) : 'plaintext';
        const languageClass = language ? `language-${language.toLowerCase() in languageMap ? languageMap[language.toLowerCase()] : language}` : '';
        
        // Add line numbers to the code
        const lines = code.split('\n');
        let numberedCode = '';
        
        // Process each line with proper line breaks for display
        lines.forEach((line, index) => {
            numberedCode += `<span class="line-number">${index + 1}</span>${line}${index < lines.length - 1 ? '\n' : ''}`;
        });
        
        return `<div class="code-block-container">
            <div class="code-header clearfix">
                <span class="copy-code-btn pull-right">Copy</span>
                <span class="code-language">${displayLang}</span>
            </div>
            <pre class="code-block line-numbers"><code class="${languageClass}">${numberedCode}</code></pre>
        </div>`;
    };
    
    // Enhanced table renderer with responsive container
    renderer.table = function(header, body) {
        return '<div class="table-container"><table class="ai-table">' +
            (header ? '<thead>' + header + '</thead>' : '') +
            '<tbody>' + body + '</tbody>' +
            '</table></div>';
    };
    
    // Enhanced table cell renderer to ensure proper content
    renderer.tablecell = function(content, flags) {
        const type = flags.header ? 'th' : 'td';
        const tag = flags.align
            ? '<' + type + ' align="' + flags.align + '">'
            : '<' + type + '>';
        return tag + content + '</' + type + '>';
    };
    
    // Enhanced link renderer with proper attributes for security and UX
    renderer.link = function(href, title, text) {
        const titleAttr = title ? ` title="${title}"` : '';
        return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="ai-link"${titleAttr}>${text}</a>`;
    };
    
    // Enhanced list renderer
    renderer.list = function(body, ordered, start) {
        const tag = ordered ? 'ol' : 'ul';
        const startAttr = (ordered && start) ? ` start="${start}"` : '';
        return `<${tag} class="ai-list"${startAttr}>${body}</${tag}>`;
    };
    
    // Enhanced paragraph renderer
    renderer.paragraph = function(text) {
        return `<p>${text}</p>`;
    };
    
    // Enhanced blockquote renderer
    renderer.blockquote = function(quote) {
        return `<blockquote class="ai-blockquote">${quote}</blockquote>`;
    };
    
    // Enhanced heading renderer
    renderer.heading = function(text, level) {
        return `<h${level}>${text}</h${level}>`;
    };
    
    // Set the custom renderer
    marked.setOptions({ renderer: renderer });
    
    try {
        // Parse markdown with marked.js
        let formattedHTML = marked(text);
        
        // Ensure proper styling for inline code
        formattedHTML = formattedHTML.replace(/<code>([^<]+)<\/code>/g, '<code class="inline-code">$1</code>');
        
        return formattedHTML;
    } catch (error) {
        console.error('Error parsing markdown:', error);
        
        // Fallback to basic formatting if marked.js fails
        return basicMarkdownFormatting(text);
    }
}

/**
 * Basic markdown formatting fallback if marked.js fails
 * @param {string} text - The text to format
 * @returns {string} - Formatted HTML
 */
function basicMarkdownFormatting(text) {
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

        // Format code with proper line breaks 
        processedCode = formatCodeWithProperLineBreaks(processedCode);

        // Escape HTML
        processedCode = processedCode
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');

        return `<div class="code-block-container">
            <div class="code-header clearfix">
                <span class="copy-code-btn pull-right">Copy</span>
                <span class="code-language">${language || 'plaintext'}</span>
            </div>
            <pre class="code-block"><code>${processedCode}</code></pre>
        </div>`;
    });

    // Process tables - improved implementation
    // First, find all table blocks (sequences of lines starting with |)
    const tableRegex = /(^\|.+\|\r?\n)+/gm;
    text = text.replace(tableRegex, function(tableBlock) {
        const rows = tableBlock.trim().split(/\r?\n/);
        
        if (rows.length < 2) return tableBlock; // Not a proper table, return as is
        
        let hasHeader = false;
        let headerRow = '';
        let bodyRows = '';
        
        rows.forEach((row, index) => {
            // Trim the row and remove leading/trailing |
            const trimmedRow = row.trim().replace(/^\||\|$/g, '');
            
            // Split into cells
            const cells = trimmedRow.split('|').map(cell => cell.trim());
            
            // Check if this is a separator row (contains only dashes and colons)
            if (index === 1 && /^[\s\-:]+$/.test(trimmedRow.replace(/\|/g, ''))) {
                hasHeader = true;
                return; // Skip the separator row
            }
            
            // Create HTML row
            const isHeader = hasHeader && index === 0;
            const cellTag = isHeader ? 'th' : 'td';
            const cellsHtml = cells.map(cell => `<${cellTag}>${cell}</${cellTag}>`).join('');
            const rowHtml = `<tr>${cellsHtml}</tr>`;
            
            if (isHeader) {
                headerRow = rowHtml;
            } else {
                bodyRows += rowHtml;
            }
        });
        
        // Create the complete table HTML
        return `<div class="table-container"><table class="ai-table">
            ${headerRow ? `<thead>${headerRow}</thead>` : ''}
            <tbody>${bodyRows}</tbody>
        </table></div>`;
    });

    // Process inline code (must be done after table processing)
    text = text.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

    // Process links
    text = text.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="ai-link">$1</a>');

    // Process formatting - bold and italic (with variations)
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>'); // **bold**
    text = text.replace(/\_\_(.*?)\_\_/g, '<strong>$1</strong>');  // __bold__
    text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');             // *italic*
    text = text.replace(/\_(.*?)\_/g, '<em>$1</em>');             // _italic_
    text = text.replace(/~~(.*?)~~/g, '<del>$1</del>');           // ~~strikethrough~~

    // Process horizontal rules
    text = text.replace(/^(\s*[-*_]){3,}\s*$/gm, '<hr>');

    // Process unordered lists (with different markers)
    text = text.replace(/^[\s]*[-*+][\s]+(.*?)$/gm, '<li>$1</li>');
    
    // Process ordered lists (with any number)
    text = text.replace(/^[\s]*\d+\.[\s]+(.*?)$/gm, '<li>$1</li>');
    
    // Group adjacent li elements into lists
    // First clean up any whitespace between list items
    text = text.replace(/(<\/li>)\s+(<li>)/g, '$1$2');
    
    // Find unordered list groups and wrap them
    let lastIndex = 0;
    let inOrderedList = false;
    let result = '';
    
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        if (line.startsWith('<li>')) {
            // Check if this is the start of a list
            if (!inOrderedList) {
                // Determine if this is an ordered or unordered list by checking the previous line
                const prevLine = i > 0 ? lines[i-1] : '';
                const isOrdered = /^\s*\d+\./.test(prevLine);
                result += isOrdered ? '<ol class="ai-list">' : '<ul class="ai-list">';
                inOrderedList = true;
            }
            result += line;
        } else {
            // End the list if we were in one
            if (inOrderedList) {
                const isOrdered = result.endsWith('</li>') && /^\s*\d+\./.test(lines[i-2] || '');
                result += isOrdered ? '</ol>' : '</ul>';
                inOrderedList = false;
            }
            result += line + '\n';
        }
    }
    
    // Close any open list at the end
    if (inOrderedList) {
        result += '</ul>';
    }
    
    text = result;
    
    // Process headings (all levels)
    text = text.replace(/^#{6}\s+(.*?)$/gm, '<h6>$1</h6>');
    text = text.replace(/^#{5}\s+(.*?)$/gm, '<h5>$1</h5>');
    text = text.replace(/^#{4}\s+(.*?)$/gm, '<h4>$1</h4>');
    text = text.replace(/^#{3}\s+(.*?)$/gm, '<h3>$1</h3>');
    text = text.replace(/^#{2}\s+(.*?)$/gm, '<h2>$1</h2>');
    text = text.replace(/^#{1}\s+(.*?)$/gm, '<h1>$1</h1>');

    // Process blockquotes (multi-line support)
    text = text.replace(/^>\s+(.*?)$/gm, '<blockquote>$1</blockquote>');
    text = text.replace(/(<\/blockquote>)\s+(<blockquote>)/g, '<br>'); // Join adjacent blockquotes

    // Handle paragraph breaks and line breaks
    text = text.replace(/\n{2,}/g, '</p><p>'); 
    text = text.replace(/\n/g, '<br>');
    
    // Remove excessive <br> tags
    text = text.replace(/(<br\s*\/?>\s*){2,}/gi, '<br>');
    
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