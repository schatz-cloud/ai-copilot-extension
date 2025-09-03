/**
 * Configuration Manager
 * 
 * This module handles all configuration-related operations for the AI Copilot Extension.
 * It provides a centralized way to access and manage user settings, with proper
 * type safety and default value handling.
 * 
 * Key responsibilities:
 * - Reading VS Code configuration settings
 * - Providing typed access to configuration values
 * - Handling configuration updates
 * - Managing default values and validation
 * 
 * @author SATISH KUMAR NADARAJAN (penintechwiz@gmail.com)
 * @version 1.0.0
 */

import * as vscode from 'vscode';

/**
 * Configuration keys used throughout the extension
 * This enum ensures type safety and prevents typos in configuration access
 */
export enum ConfigKeys {
    API_KEY = 'aiCopilot.apiKey',
    MODEL = 'aiCopilot.model',
    ENABLE_AUTO_COMPLETE = 'aiCopilot.enableAutoComplete',
    ENABLE_MULTI_FILE_CONTEXT = 'aiCopilot.enableMultiFileContext',
    MAX_RELATED_FILES = 'aiCopilot.maxRelatedFiles',
    ENABLE_INLINE_COMPLETION = 'aiCopilot.enableInlineCompletion',
    ENABLE_AGENTIC_MODE = 'aiCopilot.enableAgenticMode',
    MAX_TOKENS = 'aiCopilot.maxTokens',
    TEMPERATURE = 'aiCopilot.temperature',
    LOCAL_ENDPOINT = 'aiCopilot.localEndpoint'
}

/**
 * Supported AI models
 * This enum defines all AI models that the extension can work with
 */
export enum SupportedModels {
    GPT_4 = 'gpt-4',
    GPT_4_TURBO = 'gpt-4-turbo',
    GPT_3_5_TURBO = 'gpt-3.5-turbo',
    CLAUDE_3_SONNET = 'claude-3-sonnet',
    CLAUDE_3_HAIKU = 'claude-3-haiku',
    LOCAL = 'local'
}

/**
 * Configuration interface for type safety
 * This interface defines the structure of all configuration options
 */
export interface ExtensionConfig {
    apiKey: string;
    model: SupportedModels;
    enableAutoComplete: boolean;
    enableMultiFileContext: boolean;
    maxRelatedFiles: number;
    enableInlineCompletion: boolean;
    enableAgenticMode: boolean;
    maxTokens: number;
    temperature: number;
    localEndpoint: string;
}

/**
 * Default configuration values
 * These values are used when user hasn't configured specific settings
 */
const defaultConfig: ExtensionConfig = {
    apiKey: '',
    model: SupportedModels.GPT_4,
    enableAutoComplete: true,
    enableMultiFileContext: true,
    maxRelatedFiles: 5,
    enableInlineCompletion: true,
    enableAgenticMode: false,
    maxTokens: 2048,
    temperature: 0.3,
    localEndpoint: 'http://localhost:11434'
};

/**
 * Configuration Manager Class
 * 
 * Provides a centralized interface for accessing and managing extension configuration.
 * All configuration access should go through this class to ensure consistency
 * and proper error handling.
 */
export class ConfigManager {
    private configuration: vscode.WorkspaceConfiguration;

    /**
     * Initialize the configuration manager
     * 
     * Sets up the workspace configuration and prepares for configuration access.
     * This should be called during extension activation.
     */
    constructor() {
        this.configuration = vscode.workspace.getConfiguration();
        this.validateConfiguration();
    }

    /**
     * Get the OpenAI API key from configuration
     * 
     * @returns The API key string, or empty string if not configured
     */
    public getApiKey(): string {
        return this.configuration.get<string>(ConfigKeys.API_KEY, defaultConfig.apiKey);
    }

    /**
     * Get the selected AI model from configuration
     * 
     * @returns The selected AI model enum value
     */
    public getModel(): SupportedModels {
        const modelString = this.configuration.get<string>(ConfigKeys.MODEL, defaultConfig.model);
        
        if (Object.values(SupportedModels).includes(modelString as SupportedModels)) {
            return modelString as SupportedModels;
        }
        
        console.warn(`Invalid model configured: ${modelString}, falling back to ${defaultConfig.model}`);
        return defaultConfig.model;
    }

    /**
     * Check if auto-completion is enabled
     * 
     * @returns True if auto-completion should be active, false otherwise
     */
    public isAutoCompleteEnabled(): boolean {
        return this.configuration.get<boolean>(ConfigKeys.ENABLE_AUTO_COMPLETE, defaultConfig.enableAutoComplete);
    }

    /**
     * Check if multi-file context is enabled
     * 
     * @returns True if multi-file context should be used, false otherwise
     */
    public isMultiFileContextEnabled(): boolean {
        return this.configuration.get<boolean>(ConfigKeys.ENABLE_MULTI_FILE_CONTEXT, defaultConfig.enableMultiFileContext);
    }

    /**
     * Get the maximum number of related files to include in context
     * 
     * @returns The maximum number of related files
     */
    public getMaxRelatedFiles(): number {
        return this.configuration.get<number>(ConfigKeys.MAX_RELATED_FILES, defaultConfig.maxRelatedFiles);
    }

    /**
     * Check if inline completion is enabled
     * 
     * @returns True if inline completion should be active, false otherwise
     */
    public isInlineCompletionEnabled(): boolean {
        return this.configuration.get<boolean>(ConfigKeys.ENABLE_INLINE_COMPLETION, defaultConfig.enableInlineCompletion);
    }

    /**
     * Check if agentic mode is enabled
     * 
     * @returns True if agentic capabilities should be active, false otherwise
     */
    public isAgenticModeEnabled(): boolean {
        return this.configuration.get<boolean>(ConfigKeys.ENABLE_AGENTIC_MODE, defaultConfig.enableAgenticMode);
    }

    /**
     * Get the maximum number of tokens for AI responses
     * 
     * @returns The maximum token count as a number
     */
    public getMaxTokens(): number {
        const maxTokens = this.configuration.get<number>(ConfigKeys.MAX_TOKENS, defaultConfig.maxTokens);
        
        if (maxTokens < 100 || maxTokens > 8192) {
            console.warn(`Invalid maxTokens value: ${maxTokens}, using default: ${defaultConfig.maxTokens}`);
            return defaultConfig.maxTokens;
        }
        
        return maxTokens;
    }

    /**
     * Get the AI temperature setting (creativity level)
     * 
     * @returns The temperature value between 0.0 and 1.0
     */
    public getTemperature(): number {
        const temperature = this.configuration.get<number>(ConfigKeys.TEMPERATURE, defaultConfig.temperature);
        
        if (temperature < 0.0 || temperature > 1.0) {
            console.warn(`Invalid temperature value: ${temperature}, using default: ${defaultConfig.temperature}`);
            return defaultConfig.temperature;
        }
        
        return temperature;
    }

    /**
     * Get the local AI model endpoint URL
     * 
     * @returns The local endpoint URL string
     */
    public getLocalEndpoint(): string {
        return this.configuration.get<string>(ConfigKeys.LOCAL_ENDPOINT, defaultConfig.localEndpoint);
    }

    /**
     * Get the complete configuration object
     * 
     * @returns A complete configuration object with all settings
     */
    public getFullConfig(): ExtensionConfig {
        return {
            apiKey: this.getApiKey(),
            model: this.getModel(),
            enableAutoComplete: this.isAutoCompleteEnabled(),
            enableMultiFileContext: this.isMultiFileContextEnabled(),
            maxRelatedFiles: this.getMaxRelatedFiles(),
            enableInlineCompletion: this.isInlineCompletionEnabled(),
            enableAgenticMode: this.isAgenticModeEnabled(),
            maxTokens: this.getMaxTokens(),
            temperature: this.getTemperature(),
            localEndpoint: this.getLocalEndpoint()
        };
    }

    /**
     * Update a configuration value
     * 
     * This method allows programmatic updates to configuration values.
     * The changes will be persisted to the user's VS Code settings.
     * 
     * @param key - The configuration key to update
     * @param value - The new value to set
     * @param target - The configuration target (global, workspace, etc.)
     */
    public async updateConfiguration(
        key: string, 
        value: any, 
        target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Global
    ): Promise<void> {
        try {
            await this.configuration.update(key, value, target);
            
            this.configuration = vscode.workspace.getConfiguration();
            
            console.log(`Configuration updated: ${key} = ${value}`);
        } catch (error) {
            console.error(`Failed to update configuration ${key}:`, error);
            throw new Error(`Failed to update configuration: ${error}`);
        }
    }

    /**
     * Reset a configuration value to its default
     * 
     * @param key - The configuration key to reset
     * @param target - The configuration target to reset
     */
    public async resetConfiguration(
        key: string, 
        target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Global
    ): Promise<void> {
        try {
            await this.configuration.update(key, undefined, target);
            this.configuration = vscode.workspace.getConfiguration();
            console.log(`Configuration reset: ${key}`);
        } catch (error) {
            console.error(`Failed to reset configuration ${key}:`, error);
            throw new Error(`Failed to reset configuration: ${error}`);
        }
    }

    /**
     * Validate the current configuration
     * 
     * This method checks the current configuration for common issues
     * and logs warnings for potential problems.
     */
    private validateConfiguration(): void {
        const config = this.getFullConfig();
        
        if (!config.apiKey && !config.model.startsWith('local')) {
            console.warn('⚠️ No API key configured for cloud AI model. Some features may not work.');
        }
        
        if (config.maxTokens > 4096 && config.model === SupportedModels.GPT_3_5_TURBO) {
            console.warn('⚠️ High token count configured for GPT-3.5-turbo. This may cause API errors.');
        }
        
        if (config.model === SupportedModels.LOCAL) {
            try {
                new URL(config.localEndpoint);
            } catch (error) {
                console.warn(`⚠️ Invalid local endpoint URL: ${config.localEndpoint}`);
            }
        }
        
        console.log('✅ Configuration validation completed');
    }

    /**
     * Listen for configuration changes
     * 
     * Sets up a listener that will be called whenever the user changes
     * extension configuration in VS Code settings.
     * 
     * @param callback - Function to call when configuration changes
     * @returns Disposable to stop listening for changes
     */
    public onConfigurationChanged(callback: (config: ExtensionConfig) => void): vscode.Disposable {
        return vscode.workspace.onDidChangeConfiguration((event) => {
            const relevantKeys = Object.values(ConfigKeys);
            const hasRelevantChange = relevantKeys.some(key => event.affectsConfiguration(key));
            
            if (hasRelevantChange) {
                this.configuration = vscode.workspace.getConfiguration();
                this.validateConfiguration();
                callback(this.getFullConfig());
            }
        });
    }

    /**
     * Export configuration for backup or sharing
     * 
     * @returns A JSON string representation of the current configuration
     */
    public exportConfiguration(): string {
        const config = this.getFullConfig();
        
        const exportConfig = { ...config };
        exportConfig.apiKey = config.apiKey ? '[CONFIGURED]' : '[NOT_CONFIGURED]';
        
        return JSON.stringify(exportConfig, null, 2);
    }

    /**
     * Check if the extension is properly configured
     * 
     * @returns True if the extension has the minimum required configuration
     */
    public isProperlyConfigured(): boolean {
        const config = this.getFullConfig();
        
        if (!config.model.startsWith('local') && !config.apiKey) {
            return false;
        }
        
        if (config.model === SupportedModels.LOCAL) {
            try {
                new URL(config.localEndpoint);
            } catch {
                return false;
            }
        }
        
        return true;
    }
}
