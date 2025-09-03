/**
 * Chat Panel View
 * 
 * This module implements the chat interface for the AI Copilot Extension.
 * It provides a webview-based chat panel in the VS Code activity bar where
 * users can have conversations with the AI assistant.
 * 
 * Key features:
 * - Interactive chat interface with message history
 * - Code snippet support and syntax highlighting
 * - File reference integration
 * - Conversation persistence across sessions
 * - Context-aware responses based on current workspace
 * 
 * @author SATISH KUMAR NADARAJAN (penintechwiz@gmail.com)
 * @version 1.0.0
 */

import * as vscode from 'vscode';
import { AIProvider, AIMessage } from '../providers/aiProvider';
import { Logger } from '../utils/logger';

/**
 * Chat message interface for the UI
 */
interface ChatMessage {
    /** Unique message ID */
    id: string;
    
    /** Message role (user or assistant) */
    role: 'user' | 'assistant';
    
    /** Message content */
    content: string;
    
    /** Timestamp when message was created */
    timestamp: Date;
    
    /** Optional code snippets in the message */
    codeSnippets?: Array<{
        language: string;
        code: string;
    }>;
    
    /** Optional file references */
    fileReferences?: Array<{
        path: string;
        lineStart?: number;
        lineEnd?: number;
    }>;
}

/**
 * Chat Panel Class
 * 
 * Implements the chat interface as a VS Code TreeDataProvider and WebviewViewProvider.
 * Manages the chat UI, message history, and AI interactions.
 */
export class ChatPanel implements vscode.TreeDataProvider<ChatMessage>, vscode.WebviewViewProvider {
    private _onDidChangeTreeData: vscode.EventEmitter<ChatMessage | undefined | null | void> = new vscode.EventEmitter<ChatMessage | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ChatMessage | undefined | null | void> = this._onDidChangeTreeData.event;

    private webviewView: vscode.WebviewView | undefined;
    private context: vscode.ExtensionContext;
    private aiProvider: AIProvider;
    private logger: Logger;
    private messages: ChatMessage[] = [];
    private conversationHistory: AIMessage[] = [];

    /**
     * Initialize the chat panel
     * 
     * @param context - VS Code extension context
     * @param aiProvider - AI provider for generating responses
     * @param logger - Logger instance for debugging
     */
    constructor(context: vscode.ExtensionContext, aiProvider: AIProvider, logger: Logger) {
        this.context = context;
        this.aiProvider = aiProvider;
        this.logger = logger;
        
        this.loadConversationHistory();
        
        this.logger.info('🔧 Chat Panel initialized');
    }

    /**
     * Resolve the webview view (called by VS Code)
     * 
     * @param webviewView - The webview view to resolve
     * @param context - Webview view resolve context
     * @param token - Cancellation token
     */
    resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        
        this.webviewView = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.context.extensionUri]
        };

        webviewView.webview.html = this.getWebviewContent();

        webviewView.webview.onDidReceiveMessage(
            async (message) => {
                await this.handleWebviewMessage(message);
            },
            undefined,
            this.context.subscriptions
        );

        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                this.refreshWebview();
            }
        });

        this.logger.info('✅ Chat Panel webview resolved');
    }

    /**
     * Get tree item representation for VS Code tree view
     * 
     * @param element - Chat message element
     * @returns Tree item representation
     */
    getTreeItem(element: ChatMessage): vscode.TreeItem {
        const item = new vscode.TreeItem(
            `${element.role === 'user' ? '👤' : '🤖'} ${element.content.substring(0, 50)}...`,
            vscode.TreeItemCollapsibleState.None
        );

        item.description = element.timestamp.toLocaleTimeString();
        item.tooltip = element.content;
        item.contextValue = element.role;

        return item;
    }

    /**
     * Get children for tree view (returns all messages)
     * 
     * @param element - Parent element (unused for flat list)
     * @returns Array of chat messages
     */
    getChildren(element?: ChatMessage): Thenable<ChatMessage[]> {
        if (!element) {
            return Promise.resolve(this.messages);
        }
        return Promise.resolve([]);
    }

    /**
     * Show the chat panel
     */
    async show(): Promise<void> {
        if (this.webviewView) {
            this.webviewView.show(true);
        } else {
            await vscode.commands.executeCommand('aiCopilotChat.focus');
        }
    }

    /**
     * Focus on the chat input
     */
    async focus(): Promise<void> {
        if (this.webviewView) {
            await this.webviewView.webview.postMessage({
                type: 'focus-input'
            });
        }
    }

    /**
     * Send a message to the chat
     * 
     * @param content - Message content
     * @param role - Message role (user or assistant)
     */
    async sendMessage(content: string, role: 'user' | 'assistant' = 'user'): Promise<void> {
        const message: ChatMessage = {
            id: this.generateMessageId(),
            role,
            content,
            timestamp: new Date()
        };

        this.messages.push(message);
        this.conversationHistory.push({
            role,
            content,
            timestamp: message.timestamp
        });

        this._onDidChangeTreeData.fire();

        this.refreshWebview();

        if (role === 'user') {
            await this.generateAIResponse();
        }

        this.saveConversationHistory();

        this.logger.logUserAction('chat-message-sent', { role, contentLength: content.length });
    }

    /**
     * Clear the chat history
     */
    async clearChat(): Promise<void> {
        this.messages = [];
        this.conversationHistory = [];
        
        this._onDidChangeTreeData.fire();
        this.refreshWebview();
        this.saveConversationHistory();
        
        this.logger.logUserAction('chat-cleared');
    }

    /**
     * Handle messages from the webview
     * 
     * @param message - Message from webview
     */
    private async handleWebviewMessage(message: any): Promise<void> {
        switch (message.type) {
            case 'send-message':
                await this.sendMessage(message.content, 'user');
                break;
                
            case 'clear-chat':
                await this.clearChat();
                break;
                
            case 'insert-code':
                await this.insertCodeSnippet(message.code, message.language);
                break;
                
            case 'open-file':
                await this.openFileReference(message.path, message.lineStart, message.lineEnd);
                break;
                
            case 'copy-message':
                await vscode.env.clipboard.writeText(message.content);
                vscode.window.showInformationMessage('Message copied to clipboard');
                break;
                
            default:
                this.logger.warn('Unknown webview message type:', message.type);
        }
    }

    /**
     * Generate AI response to the latest user message
     */
    private async generateAIResponse(): Promise<void> {
        try {
            this.logger.startTimer('ai-chat-response');

            await this.webviewView?.webview.postMessage({
                type: 'typing-indicator',
                show: true
            });

            const context = await this.getCurrentWorkspaceContext();

            const response = await this.aiProvider.generateChatCompletion(
                this.conversationHistory,
                context
            );

            await this.webviewView?.webview.postMessage({
                type: 'typing-indicator',
                show: false
            });

            await this.sendMessage(response.content, 'assistant');

            this.logger.stopTimer('ai-chat-response');

        } catch (error) {
            await this.webviewView?.webview.postMessage({
                type: 'typing-indicator',
                show: false
            });

            this.logger.error('Failed to generate AI response:', error);

            await this.sendMessage(
                '❌ Sorry, I encountered an error while processing your message. Please try again or check your AI configuration.',
                'assistant'
            );
        }
    }

    /**
     * Get current workspace context for AI responses
     * 
     * @returns Workspace context object
     */
    private async getCurrentWorkspaceContext(): Promise<any> {
        const activeEditor = vscode.window.activeTextEditor;
        
        let context: any = {
            workspaceName: vscode.workspace.name || 'Unknown',
            workspaceFolders: vscode.workspace.workspaceFolders?.map(folder => folder.name) || []
        };

        if (activeEditor) {
            const document = activeEditor.document;
            const selection = activeEditor.selection;

            context.currentFile = vscode.workspace.asRelativePath(document.fileName);
            context.language = document.languageId;
            
            if (!selection.isEmpty) {
                context.selectedText = document.getText(selection);
            }

            const contextLines = 10;
            const startLine = Math.max(0, selection.start.line - contextLines);
            const endLine = Math.min(document.lineCount - 1, selection.end.line + contextLines);
            
            context.surroundingCode = document.getText(new vscode.Range(
                new vscode.Position(startLine, 0),
                new vscode.Position(endLine, document.lineAt(endLine).text.length)
            ));
        }

        return context;
    }

    /**
     * Insert code snippet into the active editor
     * 
     * @param code - Code to insert
     * @param language - Programming language
     */
    private async insertCodeSnippet(code: string, language: string): Promise<void> {
        const activeEditor = vscode.window.activeTextEditor;
        
        if (!activeEditor) {
            vscode.window.showWarningMessage('No active editor to insert code into.');
            return;
        }

        const cleanCode = code.replace(/```[\w]*\n?/g, '').trim();

        await activeEditor.edit(editBuilder => {
            editBuilder.insert(activeEditor.selection.active, cleanCode);
        });

        try {
            await vscode.commands.executeCommand('editor.action.formatSelection');
        } catch (error) {
            this.logger.debug('Code formatting failed:', error);
        }

        this.logger.logUserAction('code-inserted-from-chat', { language, codeLength: cleanCode.length });
    }

    /**
     * Open file reference from chat
     * 
     * @param path - File path
     * @param lineStart - Optional start line
     * @param lineEnd - Optional end line
     */
    private async openFileReference(path: string, lineStart?: number, lineEnd?: number): Promise<void> {
        try {
            const uri = vscode.Uri.file(path);
            const document = await vscode.workspace.openTextDocument(uri);
            const editor = await vscode.window.showTextDocument(document);

            if (lineStart !== undefined) {
                const startPos = new vscode.Position(lineStart - 1, 0);
                const endPos = lineEnd !== undefined 
                    ? new vscode.Position(lineEnd - 1, document.lineAt(lineEnd - 1).text.length)
                    : startPos;

                editor.selection = new vscode.Selection(startPos, endPos);
                editor.revealRange(new vscode.Range(startPos, endPos));
            }

            this.logger.logUserAction('file-opened-from-chat', { path, lineStart, lineEnd });

        } catch (error) {
            this.logger.error('Failed to open file reference:', error);
            vscode.window.showErrorMessage(`Failed to open file: ${path}`);
        }
    }

    /**
     * Refresh the webview content
     */
    private refreshWebview(): void {
        if (this.webviewView) {
            this.webviewView.webview.postMessage({
                type: 'update-messages',
                messages: this.messages
            });
        }
    }

    /**
     * Generate unique message ID
     * 
     * @returns Unique message ID
     */
    private generateMessageId(): string {
        return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Load conversation history from storage
     */
    private loadConversationHistory(): void {
        try {
            const stored = this.context.globalState.get<{
                messages: ChatMessage[];
                conversationHistory: AIMessage[];
            }>('chatHistory');

            if (stored) {
                this.messages = stored.messages || [];
                this.conversationHistory = stored.conversationHistory || [];
                
                this.messages.forEach(msg => {
                    if (typeof msg.timestamp === 'string') {
                        msg.timestamp = new Date(msg.timestamp);
                    }
                });
                
                this.conversationHistory.forEach(msg => {
                    if (typeof msg.timestamp === 'string') {
                        msg.timestamp = new Date(msg.timestamp);
                    }
                });
            }

            this.logger.debug(`Loaded ${this.messages.length} messages from storage`);

        } catch (error) {
            this.logger.error('Failed to load conversation history:', error);
        }
    }

    /**
     * Save conversation history to storage
     */
    private saveConversationHistory(): void {
        try {
            this.context.globalState.update('chatHistory', {
                messages: this.messages,
                conversationHistory: this.conversationHistory
            });

            this.logger.debug(`Saved ${this.messages.length} messages to storage`);

        } catch (error) {
            this.logger.error('Failed to save conversation history:', error);
        }
    }

    /**
     * Get HTML content for the webview
     * 
     * @returns HTML content string
     */
    private getWebviewContent(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Copilot Chat</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            margin: 0;
            padding: 10px;
            height: 100vh;
            display: flex;
            flex-direction: column;
        }
        
        .chat-container {
            flex: 1;
            overflow-y: auto;
            margin-bottom: 10px;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            padding: 10px;
        }
        
        .message {
            margin-bottom: 15px;
            padding: 8px;
            border-radius: 6px;
            position: relative;
        }
        
        .message.user {
            background-color: var(--vscode-inputValidation-infoBorder);
            margin-left: 20px;
        }
        
        .message.assistant {
            background-color: var(--vscode-editor-selectionBackground);
            margin-right: 20px;
        }
        
        .message-header {
            font-size: 0.9em;
            opacity: 0.8;
            margin-bottom: 5px;
        }
        
        .message-content {
            white-space: pre-wrap;
            word-wrap: break-word;
        }
        
        .message-actions {
            position: absolute;
            top: 5px;
            right: 5px;
            opacity: 0;
            transition: opacity 0.2s;
        }
        
        .message:hover .message-actions {
            opacity: 1;
        }
        
        .action-button {
            background: none;
            border: none;
            color: var(--vscode-foreground);
            cursor: pointer;
            padding: 2px 4px;
            margin-left: 2px;
            border-radius: 2px;
        }
        
        .action-button:hover {
            background-color: var(--vscode-toolbar-hoverBackground);
        }
        
        .input-container {
            display: flex;
            gap: 5px;
        }
        
        .chat-input {
            flex: 1;
            padding: 8px;
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            font-family: inherit;
            font-size: inherit;
        }
        
        .send-button, .clear-button {
            padding: 8px 12px;
            border: none;
            border-radius: 4px;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            cursor: pointer;
            font-family: inherit;
        }
        
        .send-button:hover, .clear-button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        
        .clear-button {
            background-color: var(--vscode-inputValidation-errorBackground);
        }
        
        .typing-indicator {
            display: none;
            padding: 8px;
            font-style: italic;
            opacity: 0.7;
        }
        
        .typing-indicator.show {
            display: block;
        }
        
        .code-snippet {
            background-color: var(--vscode-textCodeBlock-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            padding: 10px;
            margin: 5px 0;
            font-family: var(--vscode-editor-font-family);
            position: relative;
        }
        
        .code-header {
            font-size: 0.8em;
            opacity: 0.8;
            margin-bottom: 5px;
        }
        
        .code-actions {
            position: absolute;
            top: 5px;
            right: 5px;
        }
        
        .empty-state {
            text-align: center;
            opacity: 0.6;
            margin-top: 50px;
        }
    </style>
</head>
<body>
    <div class="chat-container" id="chatContainer">
        <div class="empty-state" id="emptyState">
            <h3>🤖 AI Copilot Chat</h3>
            <p>Start a conversation with your AI coding assistant!</p>
            <p>Ask questions about your code, request explanations, or get help with programming tasks.</p>
        </div>
    </div>
    
    <div class="typing-indicator" id="typingIndicator">
        🤖 AI is thinking...
    </div>
    
    <div class="input-container">
        <input type="text" class="chat-input" id="chatInput" placeholder="Ask me anything about your code..." />
        <button class="send-button" id="sendButton">Send</button>
        <button class="clear-button" id="clearButton">Clear</button>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const chatContainer = document.getElementById('chatContainer');
        const chatInput = document.getElementById('chatInput');
        const sendButton = document.getElementById('sendButton');
        const clearButton = document.getElementById('clearButton');
        const typingIndicator = document.getElementById('typingIndicator');
        const emptyState = document.getElementById('emptyState');

        let messages = [];

        window.addEventListener('message', event => {
            const message = event.data;
            
            switch (message.type) {
                case 'update-messages':
                    messages = message.messages;
                    renderMessages();
                    break;
                    
                case 'typing-indicator':
                    if (message.show) {
                        typingIndicator.classList.add('show');
                    } else {
                        typingIndicator.classList.remove('show');
                    }
                    break;
                    
                case 'focus-input':
                    chatInput.focus();
                    break;
            }
        });

        function sendMessage() {
            const content = chatInput.value.trim();
            if (content) {
                vscode.postMessage({
                    type: 'send-message',
                    content: content
                });
                chatInput.value = '';
            }
        }

        function clearChat() {
            vscode.postMessage({
                type: 'clear-chat'
            });
        }

        function renderMessages() {
            if (messages.length === 0) {
                emptyState.style.display = 'block';
                return;
            }
            
            emptyState.style.display = 'none';
            
            chatContainer.innerHTML = messages.map(msg => {
                const timestamp = new Date(msg.timestamp).toLocaleTimeString();
                const role = msg.role === 'user' ? '👤 You' : '🤖 AI Assistant';
                
                return \`
                    <div class="message \${msg.role}">
                        <div class="message-header">\${role} • \${timestamp}</div>
                        <div class="message-content">\${formatMessageContent(msg.content)}</div>
                        <div class="message-actions">
                            <button class="action-button" onclick="copyMessage('\${msg.id}')" title="Copy">📋</button>
                        </div>
                    </div>
                \`;
            }).join('');
            
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }

        function formatMessageContent(content) {
            content = content.replace(/\`\`\`(\\w+)?\\n?([\\s\\S]*?)\\n?\`\`\`/g, (match, lang, code) => {
                const language = lang || 'text';
                return \`
                    <div class="code-snippet">
                        <div class="code-header">Code (\${language})</div>
                        <div class="code-actions">
                            <button class="action-button" onclick="insertCode('\${escapeHtml(code)}', '\${language}')" title="Insert">📝</button>
                        </div>
                        <pre><code>\${escapeHtml(code)}</code></pre>
                    </div>
                \`;
            });
            
            content = content.replace(/\`([^\`]+)\`/g, '<code>$1</code>');
            
            return content;
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        function copyMessage(messageId) {
            const message = messages.find(m => m.id === messageId);
            if (message) {
                vscode.postMessage({
                    type: 'copy-message',
                    content: message.content
                });
            }
        }

        function insertCode(code, language) {
            vscode.postMessage({
                type: 'insert-code',
                code: code,
                language: language
            });
        }

        sendButton.addEventListener('click', sendMessage);
        clearButton.addEventListener('click', clearChat);
        
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        chatInput.focus();
    </script>
</body>
</html>`;
    }

    /**
     * Dispose of resources
     */
    dispose(): void {
        this._onDidChangeTreeData.dispose();
        this.logger.info('Chat Panel disposed');
    }
}
