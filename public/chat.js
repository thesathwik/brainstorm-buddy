class BrainstormChat {
    constructor() {
        this.ws = null;
        this.username = '';
        this.userId = '';
        this.sessionId = 'shared-vc-session';
        this.isConnected = false;
        this.participants = new Map();
        
        this.initializeElements();
        this.setupEventListeners();
        this.connectToBot();
    }

    initializeElements() {
        this.elements = {
            statusDot: document.getElementById('statusDot'),
            statusText: document.getElementById('statusText'),
            participants: document.getElementById('participants'),
            messagesContainer: document.getElementById('messagesContainer'),
            errorContainer: document.getElementById('errorContainer'),
            joinForm: document.getElementById('joinForm'),
            messageForm: document.getElementById('messageForm'),
            usernameInput: document.getElementById('usernameInput'),
            roleSelect: document.getElementById('roleSelect'),
            joinBtn: document.getElementById('joinBtn'),
            messageInput: document.getElementById('messageInput'),
            sendBtn: document.getElementById('sendBtn'),
            typingIndicator: document.getElementById('typingIndicator'),
            botHint: document.getElementById('botHint')
        };
    }

    setupEventListeners() {
        // Join form
        this.elements.joinBtn.addEventListener('click', () => this.joinSession());
        this.elements.usernameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.joinSession();
        });

        // Message form
        this.elements.sendBtn.addEventListener('click', () => this.sendMessage());
        this.elements.messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // Auto-resize textarea
        this.elements.messageInput.addEventListener('input', (e) => {
            e.target.style.height = 'auto';
            e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
        });
    }

    connectToBot() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        
        try {
            this.ws = new WebSocket(wsUrl);
            
            this.ws.onopen = () => {
                this.isConnected = true;
                this.updateStatus('Connected', true);
            };

            this.ws.onmessage = (event) => {
                const data = JSON.parse(event.data);
                this.handleMessage(data);
            };

            this.ws.onclose = () => {
                this.isConnected = false;
                this.updateStatus('Disconnected', false);
                setTimeout(() => this.connectToBot(), 3000);
            };

            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.showError('Connection error. Retrying...');
            };

        } catch (error) {
            console.error('Failed to connect:', error);
            this.showError('Failed to connect to server');
        }
    }

    updateStatus(text, connected) {
        this.elements.statusText.textContent = text;
        this.elements.statusDot.classList.toggle('connected', connected);
    }

    joinSession() {
        const username = this.elements.usernameInput.value.trim();
        const role = this.elements.roleSelect.value;

        if (!username) {
            this.showError('Please enter your name');
            return;
        }

        if (!this.isConnected) {
            this.showError('Not connected to server');
            return;
        }

        this.username = username;
        this.userId = 'user-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

        this.ws.send(JSON.stringify({
            type: 'user_joined',
            userId: this.userId,
            username: this.username,
            role: role,
            sessionId: this.sessionId
        }));

        // Hide join form, show message form
        this.elements.joinForm.classList.add('hidden');
        this.elements.messageForm.classList.remove('hidden');
        this.elements.botHint.classList.remove('hidden');
        
        this.elements.messageInput.focus();
        this.clearError();
    }

    sendMessage() {
        const content = this.elements.messageInput.value.trim();
        
        if (!content) return;
        if (!this.isConnected) {
            this.showError('Not connected to server');
            return;
        }

        const message = {
            type: 'message',
            message: {
                content: content,
                timestamp: new Date().toISOString(),
                userId: this.userId,
                username: this.username
            }
        };

        this.ws.send(JSON.stringify(message));
        this.elements.messageInput.value = '';
        this.elements.messageInput.style.height = 'auto';
        this.elements.sendBtn.disabled = false;
    }

    handleMessage(data) {
        switch (data.type) {
            case 'welcome':
                console.log('Connected to server');
                break;

            case 'user_joined':
                this.participants.set(data.userId, {
                    username: data.username,
                    role: data.role
                });
                this.updateParticipants();
                break;

            case 'user_message':
                // Determine if this is your message or someone else's
                const messageType = data.userId === this.userId ? 'own' : 'other';
                this.displayMessage(data.content, data.username, messageType, data.timestamp);
                break;

            case 'bot_response':
                this.hideTyping();
                this.displayMessage(data.content, 'AI Assistant', 'bot', data.timestamp);
                break;

            case 'error':
                this.showError(data.message);
                break;
        }
    }

    displayMessage(content, username, type, timestamp) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}`;

        const bubble = document.createElement('div');
        bubble.className = 'message-bubble';
        
        // Add username at the top for better visibility
        if (type !== 'bot') {
            const usernameDiv = document.createElement('div');
            usernameDiv.className = 'message-username';
            usernameDiv.textContent = username;
            bubble.appendChild(usernameDiv);
        }
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        contentDiv.innerHTML = content;
        bubble.appendChild(contentDiv);

        const meta = document.createElement('div');
        meta.className = 'message-meta';
        meta.textContent = type === 'bot' ? 'AI Assistant' : new Date(timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

        bubble.appendChild(meta);
        messageDiv.appendChild(bubble);

        this.elements.messagesContainer.appendChild(messageDiv);
        this.scrollToBottom();

        // Show typing indicator for bot responses
        if ((type === 'own' || type === 'other') && content.toLowerCase().includes('@bot')) {
            this.showTyping();
        }
    }

    updateParticipants() {
        this.elements.participants.innerHTML = '';
        this.participants.forEach((participant, userId) => {
            const participantDiv = document.createElement('div');
            participantDiv.className = 'participant';
            participantDiv.textContent = participant.username;
            this.elements.participants.appendChild(participantDiv);
        });
    }

    showTyping() {
        this.elements.typingIndicator.classList.remove('hidden');
        this.scrollToBottom();
    }

    hideTyping() {
        this.elements.typingIndicator.classList.add('hidden');
    }

    showError(message) {
        this.elements.errorContainer.innerHTML = `<div class="error">${message}</div>`;
        setTimeout(() => this.clearError(), 5000);
    }

    clearError() {
        this.elements.errorContainer.innerHTML = '';
    }

    scrollToBottom() {
        setTimeout(() => {
            this.elements.messagesContainer.scrollTop = this.elements.messagesContainer.scrollHeight;
        }, 100);
    }
}

// Initialize the chat when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new BrainstormChat();
});