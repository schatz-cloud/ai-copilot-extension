/**
 * Workspace Indexer Service
 * 
 * This service handles background workspace file scanning, indexing, and summarization
 * to provide enhanced context for AI interactions.
 * 
 * @author SATISH KUMAR NADARAJAN (penintechwiz@gmail.com)
 * @version 1.0.0
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { Logger } from '../utils/logger';
import { ConfigManager } from '../utils/config';

export interface IndexedFile {
    path: string;
    content: string;
    summary?: string;
    language: string;
    relevanceScore: number;
    lastModified: Date;
    size: number;
}

export interface IndexingStatus {
    isComplete: boolean;
    totalFiles: number;
    indexedFiles: number;
    lastUpdated: Date;
}

export class WorkspaceIndexer {
    private static readonly FILE_CHANGE_DEBOUNCE_MS = 1000;
    private static readonly FILE_CREATE_DEBOUNCE_MS = 500;
    
    private logger: Logger;
    private configManager: ConfigManager;
    private indexedFiles: Map<string, IndexedFile> = new Map();
    private indexingStatus: IndexingStatus;
    private fileWatcher: vscode.FileSystemWatcher | undefined;
    private isIndexing = false;
    private indexingCancellation: vscode.CancellationTokenSource | undefined;

    constructor(logger: Logger, configManager: ConfigManager) {
        this.logger = logger;
        this.configManager = configManager;
        this.indexingStatus = {
            isComplete: false,
            totalFiles: 0,
            indexedFiles: 0,
            lastUpdated: new Date()
        };
        
        this.setupFileWatchers();
        this.logger.info('🔧 Workspace Indexer initialized');
    }

    async startIndexing(workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
        if (this.isIndexing) {
            this.logger.warn('Indexing already in progress');
            return;
        }

        if (!this.configManager.isWorkspaceIndexingEnabled()) {
            this.logger.info('Workspace indexing is disabled');
            return;
        }

        this.isIndexing = true;
        this.indexingCancellation = new vscode.CancellationTokenSource();
        
        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Indexing workspace files...",
                cancellable: true
            }, async (progress, token) => {
                token.onCancellationRequested(() => {
                    this.indexingCancellation?.cancel();
                });

                const files = await this.findWorkspaceFiles(workspaceFolder);
                this.indexingStatus.totalFiles = files.length;
                this.indexingStatus.indexedFiles = 0;

                for (let i = 0; i < files.length; i++) {
                    if (this.indexingCancellation?.token.isCancellationRequested) {
                        break;
                    }

                    const file = files[i];
                    await this.indexFile(file);
                    
                    this.indexingStatus.indexedFiles = i + 1;
                    progress.report({
                        increment: (100 / files.length),
                        message: `${i + 1}/${files.length} files indexed`
                    });
                }

                this.indexingStatus.isComplete = !this.indexingCancellation?.token.isCancellationRequested;
                this.indexingStatus.lastUpdated = new Date();
            });
        } finally {
            this.isIndexing = false;
            this.indexingCancellation = undefined;
        }
    }

    getIndexedFiles(query?: string): IndexedFile[] {
        const files = Array.from(this.indexedFiles.values());
        
        if (!query) {
            return files.sort((a, b) => b.relevanceScore - a.relevanceScore);
        }

        return files
            .filter(file => this.isRelevantToQuery(file, query))
            .sort((a, b) => b.relevanceScore - a.relevanceScore);
    }

    getStatus(): IndexingStatus {
        return { ...this.indexingStatus };
    }

    async updateFileIndex(uri: vscode.Uri): Promise<void> {
        if (!this.configManager.isWorkspaceIndexingEnabled()) {
            return;
        }

        try {
            await this.indexFile(uri);
            this.logger.debug(`Updated index for file: ${uri.fsPath}`);
        } catch (error) {
            this.logger.error(`Failed to update index for file ${uri.fsPath}:`, error);
        }
    }

    summarizeFile(content: string, language: string): string {
        const threshold = this.configManager.getFileSummarizationThreshold();
        
        if (content.length < threshold) {
            return content;
        }

        if (['typescript', 'javascript', 'tsx', 'jsx'].includes(language)) {
            return this.summarizeJavaScriptFile(content);
        } else if (language === 'python') {
            return this.summarizePythonFile(content);
        } else {
            return this.summarizeGenericFile(content);
        }
    }

    private async findWorkspaceFiles(workspaceFolder: vscode.WorkspaceFolder): Promise<vscode.Uri[]> {
        const ignorePatterns = this.configManager.getIndexingIgnorePatterns();
        const maxFileSize = this.configManager.getMaxFileSizeForIndexing();
        
        const pattern = new vscode.RelativePattern(workspaceFolder, '**/*');
        const maxFilesToIndex = this.configManager.getMaxFilesToIndex();
        const files = await vscode.workspace.findFiles(pattern, `{${ignorePatterns.join(',')}}`, maxFilesToIndex);
        
        const validFiles: vscode.Uri[] = [];
        for (const file of files) {
            try {
                const stat = await vscode.workspace.fs.stat(file);
                if (stat.size <= maxFileSize && stat.type === vscode.FileType.File) {
                    validFiles.push(file);
                }
            } catch (error) {
                this.logger.debug(`Skipping file ${file.fsPath} due to error during stat:`, error);
            }
        }
        
        return validFiles;
    }

    private async indexFile(uri: vscode.Uri): Promise<void> {
        try {
            const document = await vscode.workspace.openTextDocument(uri);
            const content = document.getText();
            const language = document.languageId;
            const stat = await vscode.workspace.fs.stat(uri);
            
            const summary = this.summarizeFile(content, language);
            const relevanceScore = this.calculateBaseRelevanceScore(uri, language);
            
            const indexedFile: IndexedFile = {
                path: uri.fsPath,
                content: content,
                summary: summary !== content ? summary : undefined,
                language: language,
                relevanceScore: relevanceScore,
                lastModified: new Date(stat.mtime),
                size: content.length
            };
            
            this.indexedFiles.set(uri.fsPath, indexedFile);
        } catch (error) {
            this.logger.error(`Failed to index file ${uri.fsPath}:`, error);
        }
    }

    private calculateBaseRelevanceScore(uri: vscode.Uri, _language: string): number {
        let score = 0.5;
        
        const fileName = path.basename(uri.fsPath);
        const ext = path.extname(uri.fsPath);
        
        if (['index', 'main', 'app'].some(name => fileName.toLowerCase().includes(name))) {
            score += 0.2;
        }
        
        if (['.ts', '.js', '.tsx', '.jsx', '.py'].includes(ext)) {
            score += 0.2;
        }
        
        if (fileName.includes('.min.') || fileName.includes('.bundle.')) {
            score -= 0.3;
        }
        
        return Math.max(0.1, Math.min(1.0, score));
    }

    private isRelevantToQuery(file: IndexedFile, query: string): boolean {
        const queryLower = query.toLowerCase();
        const fileName = path.basename(file.path).toLowerCase();
        const content = (file.summary || file.content).toLowerCase();
        
        return fileName.includes(queryLower) || content.includes(queryLower);
    }

    private summarizeJavaScriptFile(content: string): string {
        const lines = content.split('\n');
        const summary: string[] = [];
        
        const imports = lines.filter(line => line.trim().startsWith('import ') || (line.trim().startsWith('const ') && line.includes('require(')));
        summary.push(...imports.slice(0, 10));
        
        const declarations = lines.filter(line => {
            const trimmed = line.trim();
            return trimmed.startsWith('export ') || 
                   trimmed.startsWith('function ') || 
                   trimmed.startsWith('class ') ||
                   /^const\s+\w+\s*=\s*(\([^\)]*\)|\w+)?\s*=>/.test(trimmed);
        });
        summary.push(...declarations.slice(0, 15));
        
        return summary.join('\n') + '\n... (summarized)';
    }

    private summarizePythonFile(content: string): string {
        const lines = content.split('\n');
        const summary: string[] = [];
        
        const imports = lines.filter(line => line.trim().startsWith('import ') || line.trim().startsWith('from '));
        summary.push(...imports.slice(0, 10));
        
        const definitions = lines.filter(line => {
            const trimmed = line.trim();
            return trimmed.startsWith('def ') || trimmed.startsWith('class ');
        });
        summary.push(...definitions.slice(0, 15));
        
        return summary.join('\n') + '\n... (summarized)';
    }

    private summarizeGenericFile(content: string): string {
        const lines = content.split('\n');
        const maxLines = 50;
        
        if (lines.length <= maxLines) {
            return content;
        }
        
        const firstLines = lines.slice(0, 25);
        const lastLines = lines.slice(-25);
        
        return [...firstLines, '... (content truncated) ...', ...lastLines].join('\n');
    }

    private setupFileWatchers(): void {
        this.fileWatcher = vscode.workspace.createFileSystemWatcher('**/*');
        
        this.fileWatcher.onDidChange(uri => {
            setTimeout(() => this.updateFileIndex(uri), WorkspaceIndexer.FILE_CHANGE_DEBOUNCE_MS);
        });
        
        this.fileWatcher.onDidCreate(uri => {
            setTimeout(() => this.updateFileIndex(uri), WorkspaceIndexer.FILE_CREATE_DEBOUNCE_MS);
        });
        
        this.fileWatcher.onDidDelete(uri => {
            this.indexedFiles.delete(uri.fsPath);
        });
    }

    dispose(): void {
        this.fileWatcher?.dispose();
        this.indexingCancellation?.cancel();
    }
}
