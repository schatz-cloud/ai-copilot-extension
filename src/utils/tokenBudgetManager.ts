/**
 * Token Budget Manager
 * 
 * This module manages token budgets for AI requests to ensure efficient context usage
 * and prevent API limit violations. It provides token estimation, budget tracking,
 * and intelligent fallback strategies when approaching limits.
 * 
 * @author SATISH KUMAR NADARAJAN (penintechwiz@gmail.com)
 * @version 1.0.0
 */

import { AIRequestContext } from '../providers/aiProvider';
import { RelatedFile } from './contextCollector';
import { ConfigManager } from './config';

export interface TokenBudget {
    estimated: number;
    limit: number;
    usage: number;
    warningThreshold: number;
    remaining: number;
}

export interface TokenEstimation {
    prompt: number;
    context: number;
    total: number;
    breakdown: {
        systemMessage: number;
        userMessage: number;
        relatedFiles: number;
        workspaceContext: number;
    };
}

export enum BudgetStatus {
    SAFE = 'safe',
    WARNING = 'warning',
    CRITICAL = 'critical',
    EXCEEDED = 'exceeded'
}

export interface BudgetRecommendation {
    status: BudgetStatus;
    shouldSummarize: boolean;
    maxFiles: number;
    message: string;
    actions: string[];
}

export class TokenBudgetManager {
    private configManager: ConfigManager;
    private readonly CHARS_PER_TOKEN = 4;
    private readonly WARNING_THRESHOLD_RATIO = 0.8;
    private readonly CRITICAL_THRESHOLD_RATIO = 0.95;

    constructor(configManager: ConfigManager) {
        this.configManager = configManager;
    }

    public estimateTokens(content: string): number {
        if (!content) {
            return 0;
        }
        
        const charCount = content.length;
        const baseTokens = Math.ceil(charCount / this.CHARS_PER_TOKEN);
        
        const codeBlockMultiplier = content.includes('```') ? 1.1 : 1.0;
        const specialCharMultiplier = this.calculateSpecialCharMultiplier(content);
        
        return Math.ceil(baseTokens * codeBlockMultiplier * specialCharMultiplier);
    }

    public estimateContextTokens(context: AIRequestContext): TokenEstimation {
        const currentFile = context.currentFile || '';
        const selectedText = context.selectedText || '';
        const surroundingCode = context.surroundingCode || '';
        const projectContext = context.projectContext || '';
        
        let indexedFilesTokens = 0;
        if (context.indexedFiles) {
            indexedFilesTokens = context.indexedFiles.reduce((total, file) => {
                return total + this.estimateTokens(file.content);
            }, 0);
        }
        
        let attachedFilesTokens = 0;
        if (context.attachedFiles) {
            attachedFilesTokens = context.attachedFiles.reduce((total, file) => {
                return total + this.estimateTokens(file.content);
            }, 0);
        }
        
        const breakdown = {
            systemMessage: this.estimateTokens(currentFile + selectedText + surroundingCode),
            userMessage: 0, // Will be set by caller
            relatedFiles: indexedFilesTokens + attachedFilesTokens,
            workspaceContext: this.estimateTokens(projectContext)
        };
        
        const total = breakdown.systemMessage + breakdown.userMessage + 
                     breakdown.relatedFiles + breakdown.workspaceContext;
        
        return {
            prompt: breakdown.systemMessage + breakdown.userMessage,
            context: breakdown.relatedFiles + breakdown.workspaceContext,
            total,
            breakdown
        };
    }

    public checkBudget(context: AIRequestContext): TokenBudget {
        const estimation = this.estimateContextTokens(context);
        const limit = this.configManager.getMaxTokens();
        const warningThreshold = Math.floor(limit * this.WARNING_THRESHOLD_RATIO);
        
        return {
            estimated: estimation.total,
            limit,
            usage: estimation.total,
            warningThreshold,
            remaining: Math.max(0, limit - estimation.total)
        };
    }

    public getBudgetStatus(budget: TokenBudget): BudgetStatus {
        const usageRatio = budget.usage / budget.limit;
        
        if (usageRatio >= 1.0) {
            return BudgetStatus.EXCEEDED;
        } else if (usageRatio >= this.CRITICAL_THRESHOLD_RATIO) {
            return BudgetStatus.CRITICAL;
        } else if (usageRatio >= this.WARNING_THRESHOLD_RATIO) {
            return BudgetStatus.WARNING;
        } else {
            return BudgetStatus.SAFE;
        }
    }

    public getRecommendations(budget: TokenBudget, context: AIRequestContext): BudgetRecommendation {
        const status = this.getBudgetStatus(budget);
        const estimation = this.estimateContextTokens(context);
        
        switch (status) {
            case BudgetStatus.SAFE:
                return {
                    status,
                    shouldSummarize: false,
                    maxFiles: this.configManager.getMaxRelatedFiles(),
                    message: `Token usage is within safe limits (${budget.usage}/${budget.limit})`,
                    actions: []
                };
                
            case BudgetStatus.WARNING:
                return {
                    status,
                    shouldSummarize: estimation.breakdown.relatedFiles > estimation.breakdown.userMessage,
                    maxFiles: Math.max(1, Math.floor(this.configManager.getMaxRelatedFiles() * 0.7)),
                    message: `Approaching token limit (${budget.usage}/${budget.limit}). Consider reducing context.`,
                    actions: [
                        'Reduce number of related files',
                        'Enable file summarization',
                        'Use more focused queries'
                    ]
                };
                
            case BudgetStatus.CRITICAL:
                return {
                    status,
                    shouldSummarize: true,
                    maxFiles: Math.max(1, Math.floor(this.configManager.getMaxRelatedFiles() * 0.5)),
                    message: `Critical token usage (${budget.usage}/${budget.limit}). Automatic optimizations applied.`,
                    actions: [
                        'Automatically summarizing large files',
                        'Limiting related files to most relevant',
                        'Consider breaking down complex queries'
                    ]
                };
                
            case BudgetStatus.EXCEEDED:
                return {
                    status,
                    shouldSummarize: true,
                    maxFiles: 1,
                    message: `Token limit exceeded (${budget.usage}/${budget.limit}). Aggressive optimization required.`,
                    actions: [
                        'Using only the most relevant file',
                        'Summarizing all content',
                        'Consider increasing token limit in settings'
                    ]
                };
        }
    }

    public shouldSummarizeFile(file: RelatedFile, budget: TokenBudget): boolean {
        const fileTokens = this.estimateTokens(file.content);
        const summarizationThreshold = this.configManager.getFileSummarizationThreshold();
        
        if (file.content.length > summarizationThreshold) {
            return true;
        }
        
        const status = this.getBudgetStatus(budget);
        if (status === BudgetStatus.CRITICAL || status === BudgetStatus.EXCEEDED) {
            return fileTokens > 100;
        }
        
        if (status === BudgetStatus.WARNING) {
            return fileTokens > 200;
        }
        
        return false;
    }

    public optimizeContext(context: AIRequestContext): AIRequestContext {
        const budget = this.checkBudget(context);
        const recommendations = this.getRecommendations(budget, context);
        
        if (recommendations.status === BudgetStatus.SAFE) {
            return context;
        }
        
        const optimizedContext = { ...context };
        
        if (optimizedContext.indexedFiles && optimizedContext.indexedFiles.length > 0) {
            optimizedContext.indexedFiles = optimizedContext.indexedFiles
                .sort((a, b) => b.relevanceScore - a.relevanceScore)
                .slice(0, recommendations.maxFiles);
            
            if (recommendations.shouldSummarize) {
                optimizedContext.indexedFiles = optimizedContext.indexedFiles.map(file => {
                    const relatedFile = { path: file.path, content: file.content, language: file.language, relevanceScore: file.relevanceScore };
                    if (this.shouldSummarizeFile(relatedFile, budget)) {
                        return {
                            ...file,
                            content: this.summarizeFileContent(file.content, file.language)
                        };
                    }
                    return file;
                });
            }
        }
        
        return optimizedContext;
    }

    private calculateSpecialCharMultiplier(content: string): number {
        const specialChars = (content.match(/[{}[\]().,;:]/g) || []).length;
        const totalChars = content.length;
        
        if (totalChars === 0) {
            return 1.0;
        }
        
        const specialCharRatio = specialChars / totalChars;
        return 1.0 + (specialCharRatio * 0.1);
    }

    private summarizeFileContent(content: string, _language: string): string {
        const lines = content.split('\n');
        const maxLines = 20;
        
        if (lines.length <= maxLines) {
            return content;
        }
        
        const importLines = lines.filter(line => 
            line.trim().startsWith('import ') || 
            line.trim().startsWith('from ') ||
            line.trim().startsWith('#include') ||
            line.trim().startsWith('using ')
        );
        
        const functionLines = lines.filter(line => {
            const trimmed = line.trim();
            return trimmed.includes('function ') || 
                   trimmed.includes('def ') ||
                   trimmed.includes('class ') ||
                   trimmed.includes('interface ') ||
                   trimmed.includes('type ');
        });
        
        const summary = [
            `// File summary (${lines.length} lines total, showing key definitions)`,
            ...importLines.slice(0, 5),
            '',
            ...functionLines.slice(0, 10),
            '',
            '// ... (content truncated for token budget management)'
        ];
        
        return summary.join('\n');
    }

    public formatBudgetDisplay(budget: TokenBudget): string {
        const percentage = Math.round((budget.usage / budget.limit) * 100);
        const status = this.getBudgetStatus(budget);
        
        const statusEmoji = {
            [BudgetStatus.SAFE]: '🟢',
            [BudgetStatus.WARNING]: '🟡',
            [BudgetStatus.CRITICAL]: '🟠',
            [BudgetStatus.EXCEEDED]: '🔴'
        };
        
        return `${statusEmoji[status]} ${budget.usage}/${budget.limit} tokens (${percentage}%)`;
    }
}
