/**
 * Inline Completion Provider for Real-time AI Suggestions
 * 
 * This provider implements VS Code's InlineCompletionItemProvider interface
 * to provide real-time AI-powered code suggestions as the user types.
 * 
 * @author SATISH KUMAR NADARAJAN (penintechwiz@gmail.com)
 * @version 1.0.0
 */

import * as vscode from 'vscode';
import { AIProvider, CodeCompletionRequest } from './aiProvider';
import { Logger } from '../utils/logger';
import { ContextCollector } from '../utils/contextCollector';
import { ConfigManager } from '../utils/config';

export class InlineCompletionProvider implements vscode.InlineCompletionItemProvider {
    private aiProvider: AIProvider;
    private logger: Logger;
    private contextCollector: ContextCollector;
    private debounceTimer: NodeJS.Timeout | undefined;
    private readonly debounceDelay = 500;
    
    constructor(aiProvider: AIProvider, logger: Logger, configManager: ConfigManager) {
        this.aiProvider = aiProvider;
        this.logger = logger;
        this.contextCollector = new ContextCollector(logger, configManager);
    }
    
    async provideInlineCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        _context: vscode.InlineCompletionContext,
        token: vscode.CancellationToken
    ): Promise<vscode.InlineCompletionItem[] | vscode.InlineCompletionList | undefined> {
        
        try {
            if (this.debounceTimer) {
                clearTimeout(this.debounceTimer);
            }
            
            return new Promise((resolve) => {
                this.debounceTimer = setTimeout(async () => {
                    try {
                        const items = await this.generateInlineCompletions(document, position, token);
                        resolve(items);
                    } catch (error) {
                        this.logger.error('Inline completion error:', error);
                        resolve(undefined);
                    }
                }, this.debounceDelay);
            });
            
        } catch (error) {
            this.logger.error('Inline completion provider error:', error);
            return undefined;
        }
    }
    
    private async generateInlineCompletions(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.InlineCompletionItem[]> {
        
        if (!this.shouldTriggerInlineCompletion(document, position)) {
            return [];
        }
        
        const completionRequest = await this.buildInlineCompletionRequest(document, position);
        
        if (token.isCancellationRequested) {
            return [];
        }
        
        const response = await this.aiProvider.generateCodeCompletion(completionRequest);
        
        if (token.isCancellationRequested) {
            return [];
        }
        
        return this.convertToInlineCompletionItems(response, position);
    }
    
    private shouldTriggerInlineCompletion(
        document: vscode.TextDocument,
        position: vscode.Position
    ): boolean {
        const line = document.lineAt(position.line);
        const textBeforeCursor = line.text.substring(0, position.character);
        
        if (textBeforeCursor.includes('//') || textBeforeCursor.includes('/*')) {
            return false;
        }
        
        const triggerChars = ['.', '(', '[', '{', ' '];
        const lastChar = textBeforeCursor.slice(-1);
        
        return triggerChars.includes(lastChar) || textBeforeCursor.trim().length > 3;
    }
    
    private async buildInlineCompletionRequest(
        document: vscode.TextDocument,
        position: vscode.Position
    ): Promise<CodeCompletionRequest> {
        
        const textBeforeCursor = document.getText(new vscode.Range(
            new vscode.Position(Math.max(0, position.line - 10), 0),
            position
        ));
        
        const textAfterCursor = document.getText(new vscode.Range(
            position,
            new vscode.Position(Math.min(document.lineCount - 1, position.line + 5), 0)
        ));
        
        const contextResult = await this.contextCollector.collectContext(document, position);
        
        return {
            prefix: textBeforeCursor,
            suffix: textAfterCursor,
            language: document.languageId,
            filePath: document.fileName,
            maxLength: 100,
            relatedFiles: contextResult.relatedFiles.slice(0, 2),
            imports: contextResult.imports,
            projectContext: contextResult.projectContext
        };
    }
    
    private convertToInlineCompletionItems(
        response: any,
        position: vscode.Position
    ): vscode.InlineCompletionItem[] {
        
        if (!response.completions || !Array.isArray(response.completions)) {
            return [];
        }
        
        return response.completions
            .filter((completion: any) => completion.confidence > 0.6)
            .slice(0, 1)
            .map((completion: any) => {
                const item = new vscode.InlineCompletionItem(
                    completion.text,
                    new vscode.Range(position, position)
                );
                
                
                return item;
            });
    }
    
    dispose(): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
    }
}
