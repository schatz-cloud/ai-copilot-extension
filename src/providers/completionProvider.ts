/**
 * Code Completion Provider
 * 
 * This module implements VS Code's CompletionItemProvider interface to provide
 * AI-powered code completion suggestions. It integrates with the AI provider
 * to generate intelligent completions based on code context.
 * 
 * Key features:
 * - Real-time code completion as user types
 * - Context-aware suggestions based on surrounding code
 * - Support for multiple programming languages
 * - Intelligent ranking and filtering of suggestions
 * - Performance optimization with caching and debouncing
 * 
 * @author SATISH KUMAR NADARAJAN (penintechwiz@gmail.com)
 * @version 1.0.0
 */

import * as vscode from 'vscode';
import { AIProvider, CodeCompletionRequest, AIProviderError } from './aiProvider';
import { Logger } from '../utils/logger';

/**
 * Completion cache entry for performance optimization
 */
interface CompletionCacheEntry {
    /** Cached completion items */
    items: vscode.CompletionItem[];
    
    /** Timestamp when cache entry was created */
    timestamp: number;
    
    /** Context hash for cache validation */
    contextHash: string;
}

/**
 * Code Completion Provider Class
 * 
 * Implements VS Code's CompletionItemProvider interface to provide
 * AI-powered code completion suggestions. This class handles the
 * integration between VS Code's completion API and our AI provider.
 */
export class CompletionProvider implements vscode.CompletionItemProvider {
    private aiProvider: AIProvider;
    private logger: Logger;
    private completionCache: Map<string, CompletionCacheEntry> = new Map();
    private readonly cacheTimeout = 30000; // 30 seconds cache timeout
    private readonly maxCacheSize = 100; // Maximum cache entries
    // private readonly _debounceDelay = 300; // Debounce delay in milliseconds (reserved for future use)
    private debounceTimer: NodeJS.Timeout | undefined;

    /**
     * Initialize the completion provider
     * 
     * @param aiProvider - AI provider instance for generating completions
     * @param logger - Logger instance for debugging and monitoring
     */
    constructor(aiProvider: AIProvider, logger: Logger) {
        this.aiProvider = aiProvider;
        this.logger = logger;
        
        this.logger.info('🔧 Code Completion Provider initialized');
    }

    /**
     * Provide completion items for VS Code
     * 
     * This is the main method called by VS Code when the user triggers
     * code completion (either manually or automatically while typing).
     * 
     * @param document - The document in which the command was invoked
     * @param position - The position at which the command was invoked
     * @param token - Cancellation token for the operation
     * @param context - Context information about the completion request
     * @returns Promise resolving to completion items or completion list
     */
    async provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        context: vscode.CompletionContext
    ): Promise<vscode.CompletionItem[] | vscode.CompletionList | undefined> {
        
        try {
            this.logger.startTimer('completion-request');
            
            if (!this.shouldTriggerCompletion(document, position, context)) {
                this.logger.debug('Completion not triggered due to context');
                return undefined;
            }

            const completionRequest = this.buildCompletionRequest(document, position);
            
            const cacheKey = this.generateCacheKey(completionRequest);
            const cachedResult = this.getCachedCompletion(cacheKey);
            
            if (cachedResult) {
                this.logger.debug('Using cached completion result');
                this.logger.stopTimer('completion-request');
                return cachedResult;
            }

            if (token.isCancellationRequested) {
                this.logger.debug('Completion request cancelled');
                return undefined;
            }

            this.logger.debug('Generating AI completions', {
                language: completionRequest.language,
                prefixLength: completionRequest.prefix.length,
                suffixLength: completionRequest.suffix.length
            });

            const aiResponse = await this.aiProvider.generateCodeCompletion(completionRequest);
            
            if (token.isCancellationRequested) {
                this.logger.debug('Completion request cancelled after AI response');
                return undefined;
            }

            const completionItems = this.convertToCompletionItems(aiResponse, document, position);
            
            this.cacheCompletion(cacheKey, completionItems);
            
            const duration = this.logger.stopTimer('completion-request');
            this.logger.info(`✅ Generated ${completionItems.length} completions in ${duration?.toFixed(2)}ms`);
            
            return completionItems;

        } catch (error) {
            this.logger.stopTimer('completion-request');
            
            if (error instanceof AIProviderError) {
                this.logger.warn('AI completion failed:', error.message);
                
                if (error.code === 'AUTH_ERROR') {
                    vscode.window.showErrorMessage(
                        'AI Copilot: Please check your API key configuration',
                        'Open Settings'
                    ).then(action => {
                        if (action === 'Open Settings') {
                            vscode.commands.executeCommand('workbench.action.openSettings', 'aiCopilot.apiKey');
                        }
                    });
                }
            } else {
                this.logger.error('Unexpected completion error:', error);
            }
            
            return [];
        }
    }

    /**
     * Resolve additional information for a completion item
     * 
     * This method is called when the user selects a completion item
     * to provide additional details like documentation or examples.
     * 
     * @param item - The completion item to resolve
     * @param token - Cancellation token
     * @returns Promise resolving to the resolved completion item
     */
    async resolveCompletionItem(
        item: vscode.CompletionItem,
        _token: vscode.CancellationToken
    ): Promise<vscode.CompletionItem> {
        
        try {
            if (!item.documentation && item.detail) {
                item.documentation = new vscode.MarkdownString(
                    `**AI-Generated Completion**\n\n${item.detail}\n\n` +
                    '*This suggestion was generated by AI and should be reviewed before use.*'
                );
            }

            if (item.kind === vscode.CompletionItemKind.Function) {
                const additionalInfo = this.generateFunctionDocumentation(item);
                if (additionalInfo) {
                    item.documentation = new vscode.MarkdownString(additionalInfo);
                }
            }

            return item;

        } catch (error) {
            this.logger.error('Error resolving completion item:', error);
            return item;
        }
    }

    /**
     * Determine if completion should be triggered based on context
     * 
     * @param document - Current document
     * @param position - Cursor position
     * @param context - Completion context
     * @returns True if completion should be triggered
     */
    private shouldTriggerCompletion(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.CompletionContext
    ): boolean {
        
        const lineText = document.lineAt(position.line).text;
        const beforeCursor = lineText.substring(0, position.character);
        
        if (beforeCursor.includes('//') || beforeCursor.includes('/*') || beforeCursor.includes('#')) {
            return false;
        }

        const stringChars = ['"', "'", '`'];
        let inString = false;
        for (const char of stringChars) {
            const count = (beforeCursor.match(new RegExp(char, 'g')) || []).length;
            if (count % 2 === 1) {
                inString = true;
                break;
            }
        }
        
        if (inString) {
            return false;
        }

        if (context.triggerKind === vscode.CompletionTriggerKind.TriggerCharacter) {
            return true;
        }

        if (context.triggerKind === vscode.CompletionTriggerKind.Invoke) {
            return true;
        }

        if (context.triggerKind === vscode.CompletionTriggerKind.TriggerForIncompleteCompletions) {
            return beforeCursor.trim().length > 2;
        }

        return false;
    }

    /**
     * Build a completion request from VS Code context
     * 
     * @param document - Current document
     * @param position - Cursor position
     * @returns Code completion request object
     */
    private buildCompletionRequest(
        document: vscode.TextDocument,
        position: vscode.Position
    ): CodeCompletionRequest {
        
        const textBeforeCursor = document.getText(new vscode.Range(
            new vscode.Position(0, 0),
            position
        ));
        
        const textAfterCursor = document.getText(new vscode.Range(
            position,
            new vscode.Position(document.lineCount - 1, document.lineAt(document.lineCount - 1).text.length)
        ));

        const maxContextLength = 2000;
        const prefix = textBeforeCursor.length > maxContextLength 
            ? textBeforeCursor.substring(textBeforeCursor.length - maxContextLength)
            : textBeforeCursor;
            
        const suffix = textAfterCursor.length > maxContextLength
            ? textAfterCursor.substring(0, maxContextLength)
            : textAfterCursor;

        return {
            prefix,
            suffix,
            language: document.languageId,
            filePath: document.fileName,
            maxLength: 200 // Reasonable completion length
        };
    }

    /**
     * Convert AI response to VS Code completion items
     * 
     * @param aiResponse - Response from AI provider
     * @param document - Current document
     * @param position - Cursor position
     * @returns Array of VS Code completion items
     */
    private convertToCompletionItems(
        aiResponse: any,
        _document: vscode.TextDocument,
        _position: vscode.Position
    ): vscode.CompletionItem[] {
        
        const items: vscode.CompletionItem[] = [];

        if (!aiResponse.completions || !Array.isArray(aiResponse.completions)) {
            this.logger.warn('Invalid AI response format for completions');
            return items;
        }

        for (const completion of aiResponse.completions) {
            const item = new vscode.CompletionItem(
                completion.text,
                this.mapCompletionKind(completion.type)
            );

            item.insertText = completion.text;
            
            item.detail = `AI Suggestion (${aiResponse.model})`;
            item.documentation = completion.documentation || 'AI-generated code completion';
            
            item.sortText = this.generateSortText(completion.confidence);
            
            item.filterText = completion.text;
            
            if (completion.confidence < 0.5) {
                item.label = `${completion.text} (low confidence)`;
            }

            item.commitCharacters = ['.', '(', '[', ' '];

            items.push(item);
        }

        return items;
    }

    /**
     * Map AI completion type to VS Code completion kind
     * 
     * @param completionType - Type from AI provider
     * @returns VS Code completion item kind
     */
    private mapCompletionKind(completionType?: string): vscode.CompletionItemKind {
        switch (completionType?.toLowerCase()) {
            case 'function':
                return vscode.CompletionItemKind.Function;
            case 'method':
                return vscode.CompletionItemKind.Method;
            case 'variable':
                return vscode.CompletionItemKind.Variable;
            case 'class':
                return vscode.CompletionItemKind.Class;
            case 'interface':
                return vscode.CompletionItemKind.Interface;
            case 'import':
                return vscode.CompletionItemKind.Module;
            case 'keyword':
                return vscode.CompletionItemKind.Keyword;
            case 'property':
                return vscode.CompletionItemKind.Property;
            case 'control':
                return vscode.CompletionItemKind.Keyword;
            default:
                return vscode.CompletionItemKind.Text;
        }
    }

    /**
     * Generate sort text based on confidence score
     * 
     * @param confidence - Confidence score (0-1)
     * @returns Sort text for VS Code
     */
    private generateSortText(confidence: number): string {
        const sortOrder = Math.floor((1 - confidence) * 1000);
        return sortOrder.toString().padStart(4, '0');
    }

    /**
     * Generate cache key for completion request
     * 
     * @param request - Completion request
     * @returns Cache key string
     */
    private generateCacheKey(request: CodeCompletionRequest): string {
        const contextHash = this.hashString(request.prefix + request.suffix);
        return `${request.language}-${contextHash}`;
    }

    /**
     * Get cached completion if available and valid
     * 
     * @param cacheKey - Cache key
     * @returns Cached completion items or undefined
     */
    private getCachedCompletion(cacheKey: string): vscode.CompletionItem[] | undefined {
        const entry = this.completionCache.get(cacheKey);
        
        if (!entry) {
            return undefined;
        }

        const now = Date.now();
        if (now - entry.timestamp > this.cacheTimeout) {
            this.completionCache.delete(cacheKey);
            return undefined;
        }

        return entry.items;
    }

    /**
     * Cache completion result
     * 
     * @param cacheKey - Cache key
     * @param items - Completion items to cache
     */
    private cacheCompletion(cacheKey: string, items: vscode.CompletionItem[]): void {
        if (this.completionCache.size >= this.maxCacheSize) {
            const oldestKey = this.completionCache.keys().next().value;
            this.completionCache.delete(oldestKey);
        }

        this.completionCache.set(cacheKey, {
            items,
            timestamp: Date.now(),
            contextHash: cacheKey
        });
    }

    /**
     * Generate function documentation for completion items
     * 
     * @param item - Completion item
     * @returns Markdown documentation string
     */
    private generateFunctionDocumentation(item: vscode.CompletionItem): string | undefined {
        if (!item.insertText || typeof item.insertText !== 'string') {
            return undefined;
        }

        const functionText = item.insertText;
        
        const functionMatch = functionText.match(/function\s+(\w+)\s*\(([^)]*)\)/);
        if (functionMatch) {
            const [, name, params] = functionMatch;
            return `**Function: ${name}**\n\nParameters: \`${params || 'none'}\`\n\n*AI-generated function completion*`;
        }

        return undefined;
    }

    /**
     * Simple string hashing function for cache keys
     * 
     * @param str - String to hash
     * @returns Hash value as string
     */
    private hashString(str: string): string {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash).toString(36);
    }

    /**
     * Clear completion cache
     * 
     * Useful for testing or when configuration changes.
     */
    public clearCache(): void {
        this.completionCache.clear();
        this.logger.info('Completion cache cleared');
    }

    /**
     * Get cache statistics
     * 
     * @returns Cache statistics object
     */
    public getCacheStats(): {
        size: number;
        maxSize: number;
        hitRate: number;
    } {
        return {
            size: this.completionCache.size,
            maxSize: this.maxCacheSize,
            hitRate: 0 // Would need to track hits/misses for accurate calculation
        };
    }

    /**
     * Dispose of resources
     * 
     * Clean up timers and cache when the provider is disposed.
     */
    public dispose(): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        
        this.clearCache();
        this.logger.info('Completion provider disposed');
    }
}
