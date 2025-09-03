/**
 * Context Collector for Multi-File Code Completion
 * 
 * This utility collects relevant context from multiple files in the workspace
 * to enhance AI code completion with better understanding of the project structure.
 * 
 * @author SATISH KUMAR NADARAJAN (penintechwiz@gmail.com)
 * @version 1.0.0
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { Logger } from './logger';
import { ConfigManager } from './config';

export interface RelatedFile {
    path: string;
    content: string;
    language: string;
    relevanceScore: number;
}

export interface ContextCollectionResult {
    relatedFiles: RelatedFile[];
    imports: string[];
    projectContext: string;
}

export class ContextCollector {
    private configManager: ConfigManager;
    private contextCache: Map<string, ContextCollectionResult> = new Map();
    private readonly cacheTimeout = 60000;
    private readonly maxFileSize = 10000;
    
    constructor(logger: Logger, configManager: ConfigManager) {
        this.configManager = configManager;
        logger.info('🔧 Context Collector initialized');
    }
    
    async collectContext(
        document: vscode.TextDocument,
        position: vscode.Position
    ): Promise<ContextCollectionResult> {
        if (!this.configManager.isMultiFileContextEnabled()) {
            return {
                relatedFiles: [],
                imports: [],
                projectContext: this.buildProjectContext(document)
            };
        }
        
        const cacheKey = this.generateCacheKey(document, position);
        const cached = this.getCachedContext(cacheKey);
        
        if (cached) {
            return cached;
        }
        
        const result = await this.gatherContext(document, position);
        this.cacheContext(cacheKey, result);
        
        return result;
    }
    
    private async gatherContext(
        document: vscode.TextDocument,
        _position: vscode.Position
    ): Promise<ContextCollectionResult> {
        const imports = this.extractImports(document);
        const relatedFiles = await this.findRelatedFiles(document, imports);
        const projectContext = this.buildProjectContext(document);
        
        return {
            relatedFiles,
            imports,
            projectContext
        };
    }
    
    private extractImports(document: vscode.TextDocument): string[] {
        const text = document.getText();
        const imports: string[] = [];
        
        const language = document.languageId;
        
        if (['typescript', 'javascript', 'tsx', 'jsx'].includes(language)) {
            const importRegex = /import\s+.*?\s+from\s+['"`]([^'"`]+)['"`]/g;
            const requireRegex = /require\(['"`]([^'"`]+)['"`]\)/g;
            
            let match;
            while ((match = importRegex.exec(text)) !== null) {
                imports.push(match[1]);
            }
            while ((match = requireRegex.exec(text)) !== null) {
                imports.push(match[1]);
            }
        } else if (language === 'python') {
            const importRegex = /(?:from\s+(\S+)\s+import|import\s+(\S+))/g;
            let match;
            while ((match = importRegex.exec(text)) !== null) {
                imports.push(match[1] || match[2]);
            }
        }
        
        return imports;
    }
    
    private async findRelatedFiles(
        document: vscode.TextDocument,
        imports: string[]
    ): Promise<RelatedFile[]> {
        if (!vscode.workspace.workspaceFolders) {
            return [];
        }
        
        const relatedFiles: RelatedFile[] = [];
        const currentDir = path.dirname(document.fileName);
        const maxRelatedFiles = this.configManager.getMaxRelatedFiles();
        
        for (const importPath of imports) {
            const resolvedFiles = await this.resolveImportPath(importPath, currentDir);
            for (const file of resolvedFiles) {
                const relevanceScore = this.calculateRelevanceScore(file, document, importPath);
                if (relevanceScore > 0.3) {
                    relatedFiles.push({
                        path: file.fsPath,
                        content: await this.getFileContent(file),
                        language: this.getLanguageFromPath(file.fsPath),
                        relevanceScore
                    });
                }
            }
        }
        
        const sameDirectoryFiles = await this.findFilesInDirectory(currentDir);
        for (const file of sameDirectoryFiles) {
            if (file.fsPath !== document.fileName) {
                const relevanceScore = this.calculateRelevanceScore(file, document);
                if (relevanceScore > 0.2) {
                    relatedFiles.push({
                        path: file.fsPath,
                        content: await this.getFileContent(file),
                        language: this.getLanguageFromPath(file.fsPath),
                        relevanceScore
                    });
                }
            }
        }
        
        return relatedFiles
            .sort((a, b) => b.relevanceScore - a.relevanceScore)
            .slice(0, maxRelatedFiles);
    }
    
    private async resolveImportPath(importPath: string, currentDir: string): Promise<vscode.Uri[]> {
        const files: vscode.Uri[] = [];
        
        if (importPath.startsWith('.')) {
            const resolvedPath = path.resolve(currentDir, importPath);
            const extensions = ['.ts', '.js', '.tsx', '.jsx', '.py'];
            
            for (const ext of extensions) {
                try {
                    const uri = vscode.Uri.file(resolvedPath + ext);
                    const stat = await vscode.workspace.fs.stat(uri);
                    if (stat.type === vscode.FileType.File) {
                        files.push(uri);
                    }
                } catch {
                }
            }
        } else {
            const pattern = `**/*${importPath}*`;
            const foundFiles = await vscode.workspace.findFiles(pattern, '**/node_modules/**', 3);
            files.push(...foundFiles);
        }
        
        return files;
    }
    
    private calculateRelevanceScore(
        file: vscode.Uri,
        currentDocument: vscode.TextDocument,
        importPath?: string
    ): number {
        let score = 0;
        
        if (importPath) {
            score += 0.8;
        }
        
        const currentDir = path.dirname(currentDocument.fileName);
        const fileDir = path.dirname(file.fsPath);
        if (currentDir === fileDir) {
            score += 0.4;
        }
        
        const currentName = path.basename(currentDocument.fileName, path.extname(currentDocument.fileName));
        const fileName = path.basename(file.fsPath, path.extname(file.fsPath));
        if (fileName.includes(currentName) || currentName.includes(fileName)) {
            score += 0.3;
        }
        
        const currentLang = currentDocument.languageId;
        const fileLang = this.getLanguageFromPath(file.fsPath);
        if (currentLang === fileLang) {
            score += 0.2;
        }
        
        return Math.min(score, 1.0);
    }
    
    private async getFileContent(file: vscode.Uri): Promise<string> {
        try {
            const document = await vscode.workspace.openTextDocument(file);
            const content = document.getText();
            return content.length > this.maxFileSize 
                ? content.substring(0, this.maxFileSize) + '\n... (truncated)'
                : content;
        } catch {
            return '';
        }
    }
    
    private getLanguageFromPath(filePath: string): string {
        const ext = path.extname(filePath);
        const langMap: Record<string, string> = {
            '.ts': 'typescript',
            '.js': 'javascript',
            '.tsx': 'typescriptreact',
            '.jsx': 'javascriptreact',
            '.py': 'python',
            '.java': 'java',
            '.cs': 'csharp',
            '.cpp': 'cpp',
            '.c': 'c'
        };
        return langMap[ext] || 'text';
    }
    
    private async findFilesInDirectory(dirPath: string): Promise<vscode.Uri[]> {
        const pattern = new vscode.RelativePattern(dirPath, '*');
        return await vscode.workspace.findFiles(pattern, undefined, 10);
    }
    
    private buildProjectContext(document: vscode.TextDocument): string {
        const workspaceName = vscode.workspace.name || 'Unknown';
        const relativePath = vscode.workspace.asRelativePath(document.fileName);
        return `Workspace: ${workspaceName}, File: ${relativePath}`;
    }
    
    private generateCacheKey(document: vscode.TextDocument, position: vscode.Position): string {
        return `${document.fileName}:${position.line}:${position.character}`;
    }
    
    private getCachedContext(cacheKey: string): ContextCollectionResult | undefined {
        const entry = this.contextCache.get(cacheKey);
        if (entry) {
            const now = Date.now();
            if (now - (entry as any).timestamp > this.cacheTimeout) {
                this.contextCache.delete(cacheKey);
                return undefined;
            }
            return entry;
        }
        return undefined;
    }
    
    private cacheContext(cacheKey: string, result: ContextCollectionResult): void {
        (result as any).timestamp = Date.now();
        this.contextCache.set(cacheKey, result);
        
        if (this.contextCache.size > 100) {
            const firstKey = this.contextCache.keys().next().value;
            this.contextCache.delete(firstKey);
        }
    }
}
