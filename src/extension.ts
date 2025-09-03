/**
 * AI Copilot Extension - Main Entry Point
 * 
 * This file serves as the main entry point for the VS Code extension.
 * It handles extension activation, command registration, and initialization
 * of all core components including AI providers, chat interface, and agentic capabilities.
 * 
 * @author SATISH KUMAR NADARAJAN (penintechwiz@gmail.com)
 * @version 1.0.0
 */

import * as vscode from 'vscode';
import { ConfigManager } from './utils/config';
import { Logger } from './utils/logger';
import { AIProvider } from './providers/aiProvider';
import { OpenAIProvider } from './providers/openaiProvider';
import { CompletionProvider } from './providers/completionProvider';
import { ChatPanel } from './views/chatPanel';
import { AgentPanel } from './views/agentPanel';
import { CodeAgent } from './agents/codeAgent';
import { TaskAgent } from './agents/taskAgent';
import { registerCommands } from './commands';

/**
 * Extension context and global state management
 */
let extensionContext: vscode.ExtensionContext;
let configManager: ConfigManager;
let logger: Logger;
let aiProvider: AIProvider;
let completionProvider: CompletionProvider;
let chatPanel: ChatPanel;
let agentPanel: AgentPanel;
let codeAgent: CodeAgent;
let taskAgent: TaskAgent;

/**
 * Extension activation function
 * 
 * This function is called when the extension is activated.
 * It initializes all components, registers commands, and sets up providers.
 * 
 * @param context - VS Code extension context
 * @returns Promise<void>
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
    try {
        extensionContext = context;
        
        configManager = new ConfigManager();
        logger = new Logger('AI Copilot Extension');
        
        logger.info('🚀 Activating AI Copilot Extension...');
        
        await initializeAIProvider();
        
        await initializeCompletionProvider();
        
        await initializeChatInterface();
        
        await initializeAgenticCapabilities();
        
        registerCommands(context, {
            aiProvider,
            chatPanel,
            agentPanel,
            codeAgent,
            taskAgent,
            logger
        });
        
        await vscode.commands.executeCommand('setContext', 'aiCopilot.enabled', true);
        
        await showWelcomeMessage();
        
        logger.info('✅ AI Copilot Extension activated successfully!');
        
    } catch (error) {
        logger.error('❌ Failed to activate AI Copilot Extension:', error);
        
        const action = await vscode.window.showErrorMessage(
            'Failed to activate AI Copilot Extension. Please check your configuration.',
            'Open Settings',
            'View Logs',
            'Retry'
        );
        
        if (action === 'Open Settings') {
            await vscode.commands.executeCommand('workbench.action.openSettings', 'aiCopilot');
        } else if (action === 'View Logs') {
            logger.show();
        } else if (action === 'Retry') {
            await activate(context);
        }
    }
}

/**
 * Initialize AI Provider based on user configuration
 * 
 * This function creates and configures the appropriate AI provider
 * based on the user's settings (OpenAI, Claude, or local model).
 */
async function initializeAIProvider(): Promise<void> {
    logger.info('🔧 Initializing AI Provider...');
    
    const model = configManager.getModel();
    const apiKey = configManager.getApiKey();
    
    if (!apiKey && !model.startsWith('local')) {
        logger.warn('⚠️ No API key configured for cloud AI provider');
        
        const action = await vscode.window.showWarningMessage(
            'AI Copilot requires an API key to function. Would you like to configure it now?',
            'Configure API Key',
            'Use Local Model',
            'Later'
        );
        
        if (action === 'Configure API Key') {
            await vscode.commands.executeCommand('workbench.action.openSettings', 'aiCopilot.apiKey');
            return;
        } else if (action === 'Use Local Model') {
            await configManager.updateConfiguration('aiCopilot.model', 'local');
        }
    }
    
    switch (model) {
        case 'gpt-4':
        case 'gpt-4-turbo':
        case 'gpt-3.5-turbo':
            aiProvider = new OpenAIProvider(apiKey, model, {
                maxTokens: configManager.getMaxTokens(),
                temperature: configManager.getTemperature()
            });
            break;
            
        case 'claude-3-sonnet':
        case 'claude-3-haiku':
            logger.warn('Claude provider not yet implemented, falling back to OpenAI');
            aiProvider = new OpenAIProvider(apiKey, 'gpt-3.5-turbo', {
                maxTokens: configManager.getMaxTokens(),
                temperature: configManager.getTemperature()
            });
            break;
            
        case 'local':
            logger.warn('Local model provider not yet implemented, falling back to OpenAI');
            aiProvider = new OpenAIProvider(apiKey, 'gpt-3.5-turbo', {
                maxTokens: configManager.getMaxTokens(),
                temperature: configManager.getTemperature()
            });
            break;
            
        default:
            logger.error(`Unknown model: ${model}`);
            throw new Error(`Unsupported AI model: ${model}`);
    }
    
    logger.info(`✅ AI Provider initialized with model: ${model}`);
}

/**
 * Initialize code completion provider
 * 
 * Sets up the intelligent code completion functionality that provides
 * AI-powered suggestions as the user types.
 */
async function initializeCompletionProvider(): Promise<void> {
    if (!configManager.isAutoCompleteEnabled()) {
        logger.info('⏭️ Auto-completion disabled in settings');
        return;
    }
    
    logger.info('🔧 Initializing Code Completion Provider...');
    
    completionProvider = new CompletionProvider(aiProvider, logger);
    
    const supportedLanguages = [
        'typescript', 'javascript', 'python', 'java', 'csharp', 'cpp', 'c',
        'go', 'rust', 'php', 'ruby', 'swift', 'kotlin', 'scala', 'html',
        'css', 'scss', 'less', 'json', 'yaml', 'xml', 'markdown'
    ];
    
    for (const language of supportedLanguages) {
        const disposable = vscode.languages.registerCompletionItemProvider(
            language,
            completionProvider,
            ' ', '.', '(', '[', '{', '"', "'", '`'
        );
        extensionContext.subscriptions.push(disposable);
    }
    
    logger.info('✅ Code Completion Provider initialized');
}

/**
 * Initialize chat interface
 * 
 * Creates and sets up the chat panel in the activity bar where users
 * can have conversations with the AI assistant.
 */
async function initializeChatInterface(): Promise<void> {
    logger.info('🔧 Initializing Chat Interface...');
    
    chatPanel = new ChatPanel(extensionContext, aiProvider, logger);
    
    const chatWebviewProvider = vscode.window.registerWebviewViewProvider(
        'aiCopilotChat',
        chatPanel,
        {
            webviewOptions: {
                retainContextWhenHidden: true
            }
        }
    );
    
    extensionContext.subscriptions.push(chatWebviewProvider);
    
    logger.info('✅ Chat Interface initialized');
}

/**
 * Initialize agentic capabilities
 * 
 * Sets up autonomous AI agents that can perform complex tasks
 * with user oversight and approval.
 */
async function initializeAgenticCapabilities(): Promise<void> {
    if (!configManager.isAgenticModeEnabled()) {
        logger.info('⏭️ Agentic mode disabled in settings');
        return;
    }
    
    logger.info('🔧 Initializing Agentic Capabilities...');
    
    codeAgent = new CodeAgent(aiProvider, logger);
    
    taskAgent = new TaskAgent(aiProvider, codeAgent, logger);
    
    agentPanel = new AgentPanel(extensionContext, taskAgent, logger);
    
    const agentTreeView = vscode.window.createTreeView('aiCopilotAgent', {
        treeDataProvider: agentPanel,
        showCollapseAll: true
    });
    
    extensionContext.subscriptions.push(agentTreeView);
    
    await vscode.commands.executeCommand('setContext', 'aiCopilot.agenticMode', true);
    
    logger.info('✅ Agentic Capabilities initialized');
}

/**
 * Show welcome message to new users
 * 
 * Displays helpful information about the extension's features
 * and how to get started.
 */
async function showWelcomeMessage(): Promise<void> {
    const hasShownWelcome = extensionContext.globalState.get('hasShownWelcome', false);
    
    if (!hasShownWelcome) {
        const action = await vscode.window.showInformationMessage(
            '🎉 Welcome to AI Copilot Extension! Get started with AI-powered coding assistance.',
            'Open Chat',
            'View Commands',
            'Configure Settings'
        );
        
        if (action === 'Open Chat') {
            await vscode.commands.executeCommand('aiCopilot.openChat');
        } else if (action === 'View Commands') {
            await vscode.commands.executeCommand('workbench.action.showCommands');
        } else if (action === 'Configure Settings') {
            await vscode.commands.executeCommand('workbench.action.openSettings', 'aiCopilot');
        }
        
        await extensionContext.globalState.update('hasShownWelcome', true);
    }
}

/**
 * Extension deactivation function
 * 
 * This function is called when the extension is deactivated.
 * It performs cleanup operations and disposes of resources.
 */
export function deactivate(): void {
    logger.info('🔄 Deactivating AI Copilot Extension...');
    
    if (chatPanel) {
        chatPanel.dispose();
    }
    
    if (agentPanel) {
        agentPanel.dispose();
    }
    
    vscode.commands.executeCommand('setContext', 'aiCopilot.enabled', false);
    vscode.commands.executeCommand('setContext', 'aiCopilot.agenticMode', false);
    
    logger.info('✅ AI Copilot Extension deactivated');
}

/**
 * Get extension context
 * 
 * Utility function to access the extension context from other modules.
 * 
 * @returns VS Code extension context
 */
export function getExtensionContext(): vscode.ExtensionContext {
    return extensionContext;
}

/**
 * Get configuration manager
 * 
 * Utility function to access the configuration manager from other modules.
 * 
 * @returns Configuration manager instance
 */
export function getConfigManager(): ConfigManager {
    return configManager;
}
