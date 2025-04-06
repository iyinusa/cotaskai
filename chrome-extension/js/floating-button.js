(function() {
    'use strict';
    
    // Variables to track dragging
    let isDragging = false;
    let offsetX, offsetY;
    let isModalOpen = false;
    let modalIsDragging = false;
    let modalOffsetX, modalOffsetY;
    
    // Button position (will be stored in database)
    let buttonPosition = {
        right: '20px',
        bottom: '20px'
    };
    
    // Modal position
    let modalPosition = {
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)'
    };
    
    // Get extension URL for accessing resources
    const extensionUrl = chrome.runtime.getURL('');
    
    // Initialize the floating button
    function initFloatingButton() {
        // Check if button should be visible based on user preference
        chrome.runtime.sendMessage({
            action: 'get_floating_button_state'
        }, response => {
            // If there's an error or floating button is disabled, don't initialize
            if (response.error || !response.enabled) return;
            
            // Continue with initialization
            initButton();
        });
    }
    
    function initButton() {
        // Check if the button already exists
        if (document.querySelector('.cotaskai-floating-button')) {
            return;
        }
        
        // Create the button
        const button = document.createElement('div');
        button.className = 'cotaskai-floating-button';
        button.title = 'CoTaskAI Assistant';
        button.innerHTML = `<img src="${extensionUrl}images/icon.png" alt="CoTaskAI">`;
        
        // Load position from background script
        chrome.runtime.sendMessage({
            action: 'get_floating_button_position'
        }, response => {
            if (!response.error && response.position) {
                buttonPosition = response.position;
            }
            
            // Apply position
            button.style.right = buttonPosition.right;
            button.style.bottom = buttonPosition.bottom;
        });
        
        // Separate mousedown handler for dragging vs clicking
        button.addEventListener('mousedown', (e) => {
            // Only handle left mouse button
            if (e.button !== 0) return;
            
            e.preventDefault();
            
            // Set flag for potential dragging
            const startX = e.clientX;
            const startY = e.clientY;
            
            // Get the current position of the button
            const rect = button.getBoundingClientRect();
            
            // Calculate the offset of the mouse cursor from the button's corner
            offsetX = e.clientX - (window.innerWidth - rect.right);
            offsetY = e.clientY - (window.innerHeight - rect.bottom);
            
            // Add 'active' class for visual feedback
            button.classList.add('active');
            
            // Set up move and up handlers
            const moveHandler = (moveEvent) => {
                // Start dragging if mouse has moved enough
                if (!isDragging && 
                    (Math.abs(moveEvent.clientX - startX) > 5 || 
                     Math.abs(moveEvent.clientY - startY) > 5)) {
                    isDragging = true;
                }
                
                if (isDragging) {
                    moveEvent.preventDefault();
                    
                    // Calculate new position
                    const newRight = Math.max(0, window.innerWidth - moveEvent.clientX - offsetX);
                    const newBottom = Math.max(0, window.innerHeight - moveEvent.clientY - offsetY);
                    
                    // Apply new position
                    button.style.right = `${newRight}px`;
                    button.style.bottom = `${newBottom}px`;
                    
                    // Update position object
                    buttonPosition.right = `${newRight}px`;
                    buttonPosition.bottom = `${newBottom}px`;
                }
            };
            
            const upHandler = (upEvent) => {
                // Remove event listeners
                document.removeEventListener('mousemove', moveHandler);
                document.removeEventListener('mouseup', upHandler);
                
                // Remove active class
                button.classList.remove('active');
                
                if (isDragging) {
                    // Save position to database through background script
                    chrome.runtime.sendMessage({
                        action: 'save_floating_button_position',
                        position: buttonPosition
                    });
                    isDragging = false;
                } else {
                    // It was a click, not a drag
                    toggleModal();
                }
            };
            
            // Add the event listeners
            document.addEventListener('mousemove', moveHandler);
            document.addEventListener('mouseup', upHandler);
        });
        
        // Create modal overlay
        const overlay = document.createElement('div');
        overlay.className = 'cotaskai-overlay';
        
        // Create modal
        const modal = document.createElement('div');
        modal.className = 'cotaskai-modal';
        modal.style.top = modalPosition.top;
        modal.style.left = modalPosition.left;
        modal.style.transform = modalPosition.transform;
        
        // Modal header for dragging
        const modalHeader = document.createElement('div');
        modalHeader.className = 'cotaskai-modal-header';
        
        // Modal title
        const modalTitle = document.createElement('div');
        modalTitle.className = 'cotaskai-modal-title';
        modalTitle.textContent = 'CoTaskAI';
        
        // Close button
        const closeButton = document.createElement('button');
        closeButton.className = 'cotaskai-close-btn';
        closeButton.innerHTML = '×';
        closeButton.addEventListener('click', closeModal);
        
        // Create iframe for the popup content
        const iframe = document.createElement('iframe');
        iframe.className = 'cotaskai-iframe';
        iframe.src = extensionUrl + 'popup.html';
        
        // Assemble the modal
        modalHeader.appendChild(modalTitle);
        modalHeader.appendChild(closeButton);
        modal.appendChild(modalHeader);
        modal.appendChild(iframe);
        
        // Make modal header draggable
        modalHeader.addEventListener('mousedown', handleModalMouseDown);
        
        // Add overlay click to close
        overlay.addEventListener('click', closeModal);
        
        // Append the elements to the body
        document.body.appendChild(button);
        document.body.appendChild(overlay);
        document.body.appendChild(modal);
    }
    
    // Handle mousedown on the modal header for dragging
    function handleModalMouseDown(e) {
        // Only handle left mouse button and header area
        if (e.button !== 0 || !e.target.closest('.cotaskai-modal-header')) return;
        
        e.preventDefault();
        modalIsDragging = true;
        
        // Get the current position of the modal
        const modal = document.querySelector('.cotaskai-modal');
        const rect = modal.getBoundingClientRect();
        
        // Calculate the offset of the mouse cursor from the modal's corner
        modalOffsetX = e.clientX - rect.left;
        modalOffsetY = e.clientY - rect.top;
        
        // Reset transform to allow absolute positioning
        modal.style.transform = 'none';
        
        // Set up move and up handlers
        const modalMoveHandler = (moveEvent) => {
            if (modalIsDragging) {
                moveEvent.preventDefault();
                
                // Calculate new position
                const modal = document.querySelector('.cotaskai-modal');
                const newLeft = Math.max(0, Math.min(window.innerWidth - modal.offsetWidth, moveEvent.clientX - modalOffsetX));
                const newTop = Math.max(0, Math.min(window.innerHeight - modal.offsetHeight, moveEvent.clientY - modalOffsetY));
                
                // Apply new position
                modal.style.left = `${newLeft}px`;
                modal.style.top = `${newTop}px`;
                
                // Update position object
                modalPosition = {
                    top: `${newTop}px`,
                    left: `${newLeft}px`,
                    transform: 'none'
                };
            }
        };
        
        const modalUpHandler = () => {
            modalIsDragging = false;
            document.removeEventListener('mousemove', modalMoveHandler);
            document.removeEventListener('mouseup', modalUpHandler);
        };
        
        // Add the event listeners
        document.addEventListener('mousemove', modalMoveHandler);
        document.addEventListener('mouseup', modalUpHandler);
    }
    
    // Toggle the modal visibility
    function toggleModal() {
        const modal = document.querySelector('.cotaskai-modal');
        const overlay = document.querySelector('.cotaskai-overlay');
        const button = document.querySelector('.cotaskai-floating-button');
        
        if (isModalOpen) {
            closeModal();
        } else {
            modal.style.display = 'block';
            overlay.style.display = 'block';
            isModalOpen = true;
            
            // Add active class to the button
            button.classList.add('active');
        }
    }
    
    // Close the modal
    function closeModal() {
        const modal = document.querySelector('.cotaskai-modal');
        const overlay = document.querySelector('.cotaskai-overlay');
        const button = document.querySelector('.cotaskai-floating-button');
        
        modal.style.display = 'none';
        overlay.style.display = 'none';
        isModalOpen = false;
        
        // Remove active class from the button
        button.classList.remove('active');
    }
    
    // Listen for messages from the extension
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'toggleFloatingButton') {
            const button = document.querySelector('.cotaskai-floating-button');
            const modal = document.querySelector('.cotaskai-modal');
            const overlay = document.querySelector('.cotaskai-overlay');
            
            if (button) {
                button.style.display = request.visible ? 'flex' : 'none';
                
                // Also close modal if hiding button
                if (!request.visible && isModalOpen) {
                    closeModal();
                }
            } else if (request.visible) {
                // Button doesn't exist but should be visible - initialize it
                initButton();
            }
            
            sendResponse({ success: true });
        }
    });
    
    // Initialize after DOM loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initFloatingButton);
    } else {
        initFloatingButton();
    }
    
    // Re-initialize on navigation (for SPAs)
    let lastUrl = location.href; 
    new MutationObserver(() => {
        const url = location.href;
        if (url !== lastUrl) {
            lastUrl = url;
            initFloatingButton();
        }
    }).observe(document, { subtree: true, childList: true });
    
})();
