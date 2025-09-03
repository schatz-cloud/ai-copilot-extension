/**
 * Command Registration Module
 * 
 * This module handles the registration of all VS Code commands for the AI Copilot Extension.
 * It provides a centralized way to register commands and ensures proper dependency injection
 * for all command handlers.
 * 
 * Key responsibilities:
 * - Register all extension commands with VS Code
 * - Provide dependency injection for command handlers
 * - Handle command execution errors gracefully
 * - Manage command state and availability
 * 
 * @author SATISH KUMAR NADARAJAN (penintechwiz@gmail.com)
 * @version 1.0.0
 */

import * as vscode from 'vscode';
import { AIProvider } from '../providers/aiProvider';
import { ChatPanel } from '../views/chatPanel';
import { AgentPanel } from '../views/agentPanel';
import { CodeAgent } from '../agents/codeAgent';
import { TaskAgent } from '../agents/taskAgent';
import { Logger } from '../utils/logger';
import { generateCodeCommand } from './generateCode';
import { refactorCodeCommand } from './refactorCode';
import { explainCodeCommand } from './explainCode';

/**
 * Command dependencies interface
 * 
 * This interface defines all the dependencies that commands might need.
 * It ensures type safety and makes testing easier.
 */
export interface CommandDependencies {
    /** AI provider for generating responses */
    aiProvider: AIProvider;
    
    /** Chat panel for user interactions */
    chatPanel: ChatPanel;
    
    /** Agent panel for agentic capabilities */
    agentPanel?: AgentPanel;
    
    /** Code agent for autonomous coding */
    codeAgent?: CodeAgent;
    
    /** Task agent for complex operations */
    taskAgent?: TaskAgent;
    
    /** Logger for debugging and monitoring */
    logger: Logger;
}

/**
 * Command registration function
 * 
 * This function registers all extension commands with VS Code and sets up
 * the necessary command handlers with proper dependency injection.
 * 
 * @param context - VS Code extension context
 * @param dependencies - Command dependencies
 */
export function registerCommands(
    context: vscode.ExtensionContext,
    dependencies: CommandDependencies
): void {
    
    const { aiProvider, chatPanel, agentPanel, codeAgent, taskAgent, logger } = dependencies;
    
    logger.info('🔧 Registering extension commands...');

    try {
        const generateCodeDisposable = vscode.commands.registerCommand(
            'aiCopilot.generateCode',
            () => generateCodeCommand(aiProvider, logger)
        );
        context.subscriptions.push(generateCodeDisposable);
        logger.debug('✅ Registered command: aiCopilot.generateCode');

        const refactorCodeDisposable = vscode.commands.registerCommand(
            'aiCopilot.refactorCode',
            () => refactorCodeCommand(aiProvider, logger)
        );
        context.subscriptions.push(refactorCodeDisposable);
        logger.debug('✅ Registered command: aiCopilot.refactorCode');

        const explainCodeDisposable = vscode.commands.registerCommand(
            'aiCopilot.explainCode',
            () => explainCodeCommand(aiProvider, logger)
        );
        context.subscriptions.push(explainCodeDisposable);
        logger.debug('✅ Registered command: aiCopilot.explainCode');

        const openChatDisposable = vscode.commands.registerCommand(
            'aiCopilot.openChat',
            () => openChatCommand(chatPanel, logger)
        );
        context.subscriptions.push(openChatDisposable);
        logger.debug('✅ Registered command: aiCopilot.openChat');

        if (agentPanel && taskAgent) {
            const toggleAgenticDisposable = vscode.commands.registerCommand(
                'aiCopilot.toggleAgenticMode',
                () => toggleAgenticModeCommand(logger, agentPanel, taskAgent)
            );
            context.subscriptions.push(toggleAgenticDisposable);
            logger.debug('✅ Registered command: aiCopilot.toggleAgenticMode');
        }

        if (codeAgent) {
            const analyzeCodebaseDisposable = vscode.commands.registerCommand(
                'aiCopilot.analyzeCodebase',
                () => analyzeCodebaseCommand(codeAgent, logger)
            );
            context.subscriptions.push(analyzeCodebaseDisposable);
            logger.debug('✅ Registered command: aiCopilot.analyzeCodebase');
        }

        registerUtilityCommands(context, dependencies);

        logger.info('✅ All extension commands registered successfully');

    } catch (error) {
        logger.error('❌ Failed to register commands:', error);
        vscode.window.showErrorMessage(
            'AI Copilot: Failed to register commands. Please reload the extension.',
            'Reload Extension'
        ).then(action => {
            if (action === 'Reload Extension') {
                vscode.commands.executeCommand('workbench.action.reloadWindow');
            }
        });
    }
}

/**
 * Open chat command handler
 * 
 * Opens the AI chat panel and focuses on it for user interaction.
 * 
 * @param chatPanel - Chat panel instance
 * @param logger - Logger instance
 */
async function openChatCommand(chatPanel: ChatPanel, logger: Logger): Promise<void> {
    try {
        logger.logUserAction('open-chat');
        
        await chatPanel.show();
        
        await chatPanel.focus();
        
        logger.info('✅ Chat panel opened successfully');
        
    } catch (error) {
        logger.error('Failed to open chat panel:', error);
        vscode.window.showErrorMessage('Failed to open AI chat. Please try again.');
    }
}

/**
 * Toggle agentic mode command handler
 * 
 * Toggles the agentic capabilities on/off and updates the UI accordingly.
 * 
 * @param agentPanel - Agent panel instance
 * @param taskAgent - Task agent instance
 * @param logger - Logger instance
 */
async function toggleAgenticModeCommand(
    logger: Logger,
    _agentPanel?: AgentPanel,
    _taskAgent?: TaskAgent
): Promise<void> {
    
    try {
        logger.logUserAction('toggle-agentic-mode');
        
        const currentState = await vscode.workspace.getConfiguration('aiCopilot').get('enableAgenticMode', false);
        const newState = !currentState;
        
        await vscode.workspace.getConfiguration('aiCopilot').update(
            'enableAgenticMode',
            newState,
            vscode.ConfigurationTarget.Global
        );
        
        await vscode.commands.executeCommand('setContext', 'aiCopilot.agenticMode', newState);
        
        const message = newState 
            ? '🤖 Agentic mode enabled. AI can now perform autonomous actions with your approval.'
            : '🔒 Agentic mode disabled. AI will only respond to direct commands.';
            
        vscode.window.showInformationMessage(message);
        
        logger.info(`Agentic mode ${newState ? 'enabled' : 'disabled'}`);
        
    } catch (error) {
        logger.error('Failed to toggle agentic mode:', error);
        vscode.window.showErrorMessage('Failed to toggle agentic mode. Please try again.');
    }
}

/**
 * Analyze codebase command handler
 * 
 * Performs AI-powered analysis of the current workspace codebase.
 * 
 * @param codeAgent - Code agent instance
 * @param logger - Logger instance
 */
async function analyzeCodebaseCommand(codeAgent: CodeAgent, logger: Logger): Promise<void> {
    try {
        logger.logUserAction('analyze-codebase');
        
        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            vscode.window.showWarningMessage('Please open a workspace to analyze the codebase.');
            return;
        }
        
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Analyzing codebase with AI...',
            cancellable: true
        }, async (progress, token) => {
            
            progress.report({ increment: 0, message: 'Scanning files...' });
            
            const analysisType = await vscode.window.showQuickPick([
                'Code Quality',
                'Architecture Review',
                'Security Analysis',
                'Performance Review',
                'Best Practices'
            ], {
                placeHolder: 'Select analysis type'
            });
            
            if (!analysisType) {
                return;
            }
            
            progress.report({ increment: 30, message: 'Analyzing code...' });
            
            const result = await codeAgent.analyzeWorkspace(analysisType.toLowerCase(), token);
            
            progress.report({ increment: 100, message: 'Analysis complete!' });
            
            const doc = await vscode.workspace.openTextDocument({
                content: result,
                language: 'markdown'
            });
            
            await vscode.window.showTextDocument(doc);
        });
        
        logger.info('✅ Codebase analysis completed');
        
    } catch (error) {
        logger.error('Failed to analyze codebase:', error);
        vscode.window.showErrorMessage('Failed to analyze codebase. Please try again.');
    }
}

/**
 * Register utility commands
 * 
 * Registers additional utility commands for extension management and debugging.
 * 
 * @param context - VS Code extension context
 * @param dependencies - Command dependencies
 */
function registerUtilityCommands(
    context: vscode.ExtensionContext,
    dependencies: CommandDependencies
): void {
    
    const { logger } = dependencies;
    
    const showLogsDisposable = vscode.commands.registerCommand(
        'aiCopilot.showLogs',
        () => {
            logger.show();
            logger.logUserAction('show-logs');
        }
    );
    context.subscriptions.push(showLogsDisposable);
    
    const clearLogsDisposable = vscode.commands.registerCommand(
        'aiCopilot.clearLogs',
        () => {
            Logger.clear();
            logger.info('Logs cleared by user');
            logger.logUserAction('clear-logs');
        }
    );
    context.subscriptions.push(clearLogsDisposable);
    
    const testConnectionDisposable = vscode.commands.registerCommand(
        'aiCopilot.testConnection',
        async () => {
            logger.logUserAction('test-connection');
            
            try {
                const isConnected = await dependencies.aiProvider.testConnection();
                
                if (isConnected) {
                    vscode.window.showInformationMessage('✅ AI connection test successful!');
                    logger.info('AI connection test passed');
                } else {
                    vscode.window.showWarningMessage('⚠️ AI connection test failed. Please check your configuration.');
                    logger.warn('AI connection test failed');
                }
                
            } catch (error) {
                logger.error('AI connection test error:', error);
                vscode.window.showErrorMessage('❌ AI connection test failed with error. Check logs for details.');
            }
        }
    );
    context.subscriptions.push(testConnectionDisposable);
    
    const showInfoDisposable = vscode.commands.registerCommand(
        'aiCopilot.showInfo',
        () => {
            const info = dependencies.aiProvider.getProviderInfo();
            const message = `AI Copilot Extension\n\nProvider: ${info.name}\nModel: ${info.model}\nCapabilities: ${info.capabilities.join(', ')}`;
            
            vscode.window.showInformationMessage(message, 'Open Settings').then(action => {
                if (action === 'Open Settings') {
                    vscode.commands.executeCommand('workbench.action.openSettings', 'aiCopilot');
                }
            });
            
            logger.logUserAction('show-info');
        }
    );
    context.subscriptions.push(showInfoDisposable);
    
    logger.debug('✅ Utility commands registered');
}

/**
 * Unregister all commands
 * 
 * This function is called during extension deactivation to clean up
 * command registrations and prevent memory leaks.
 * 
 * @param context - VS Code extension context
 */
export function unregisterCommands(_context: vscode.ExtensionContext): void {
}
