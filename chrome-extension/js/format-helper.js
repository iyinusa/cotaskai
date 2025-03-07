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

// Helper to format text that might include code blocks wrapped in triple backticks
const formatResponseText = (text) => {
    return deepFormating(
        text
            // Convert code blocks wrapped in triple backticks to pre/code.
            .replace(/```([\s\S]*?)```/g, (match, codeContent) => {
                return `<pre><code>${codeContent.trim()}</code></pre>`;
            })
            // Convert markdown bold syntax **text** into HTML bold.
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    );
};