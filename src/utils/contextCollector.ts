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

export enum ContextScope {
    ACTIVE_FILE = 'active-file',
    RELATED_FILES = 'related-files',
    WHOLE_PROJECT = 'whole-project'
}

export interface ContextScopeConfig {
    scope: ContextScope;
    maxFiles: number;
    includeFullContent: boolean;
    summarizationThreshold: number;
}

export interface RelatedFile {
    path: string;
    content: string;
    language: string;
    relevanceScore: number;
}

export interface EnhancedRelevanceFactors {
    importRelationship: number;
    sharedSymbols: number;
    recentEdits: number;
    userMarkedImportant: number;
    directoryProximity: number;
    fileNameSimilarity: number;
}

export interface ContextCollectionResult {
    relatedFiles: RelatedFile[];
    imports: string[];
    projectContext: string;
    scope: ContextScope;
    tokenEstimate: number;
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
        position: vscode.Position,
        scopeConfig?: ContextScopeConfig
    ): Promise<ContextCollectionResult> {
        const effectiveScope = scopeConfig?.scope || ContextScope.RELATED_FILES;
        
        if (!this.configManager.isMultiFileContextEnabled() || effectiveScope === ContextScope.ACTIVE_FILE) {
            const result = {
                relatedFiles: effectiveScope === ContextScope.ACTIVE_FILE ? [{
                    path: document.fileName,
                    content: document.getText(),
                    language: document.languageId,
                    relevanceScore: 1.0
                }] : [],
                imports: [],
                projectContext: this.buildProjectContext(document),
                scope: effectiveScope,
                tokenEstimate: this.estimateTokens([], document.getText())
            };
            return result;
        }
        
        const cacheKey = this.generateCacheKey(document, position);
        const cached = this.getCachedContext(cacheKey);
        
        if (cached) {
            return cached;
        }
        
        const result = await this.gatherContext(document, position, effectiveScope);
        this.cacheContext(cacheKey, result);
        
        return result;
    }
    
    private async gatherContext(
        document: vscode.TextDocument,
        _position: vscode.Position,
        scope: ContextScope = ContextScope.RELATED_FILES
    ): Promise<ContextCollectionResult> {
        const maxFiles = this.configManager.getMaxRelatedFiles();
        const imports = this.extractImports(document);
        const relatedFiles = await this.findRelatedFiles(document, imports, maxFiles, scope);
        const projectContext = this.buildProjectContext(document);
        const tokenEstimate = this.estimateTokens(relatedFiles, projectContext);
        
        return {
            relatedFiles,
            imports,
            projectContext,
            scope,
            tokenEstimate
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
        imports: string[],
        maxFiles: number,
        scope: ContextScope = ContextScope.RELATED_FILES
    ): Promise<RelatedFile[]> {
        if (!vscode.workspace.workspaceFolders) {
            return [];
        }
        
        if (scope === ContextScope.ACTIVE_FILE) {
            return [{
                path: document.fileName,
                content: document.getText(),
                language: document.languageId,
                relevanceScore: 1.0
            }];
        }
        
        const relatedFiles: RelatedFile[] = [];
        const currentDir = path.dirname(document.fileName);
        
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
            .slice(0, maxFiles);
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
        const factors = this.calculateEnhancedRelevanceFactors(file, currentDocument, importPath);
        
        const weights = this.configManager.getRelevanceScoreWeights();
        
        const score = 
            factors.importRelationship * weights.importRelationship +
            factors.sharedSymbols * weights.sharedSymbols +
            factors.recentEdits * weights.recentEdits +
            factors.userMarkedImportant * weights.userMarkedImportant +
            factors.directoryProximity * weights.directoryProximity +
            factors.fileNameSimilarity * weights.fileNameSimilarity;
        
        return Math.min(score, 1.0);
    }
    
    private calculateEnhancedRelevanceFactors(
        file: vscode.Uri,
        currentDocument: vscode.TextDocument,
        importPath?: string
    ): EnhancedRelevanceFactors {
        const factors: EnhancedRelevanceFactors = {
            importRelationship: 0,
            sharedSymbols: 0,
            recentEdits: 0,
            userMarkedImportant: 0,
            directoryProximity: 0,
            fileNameSimilarity: 0
        };
        
        if (importPath) {
            factors.importRelationship = 0.8;
        }
        
        const currentDir = path.dirname(currentDocument.fileName);
        const fileDir = path.dirname(file.fsPath);
        if (currentDir === fileDir) {
            factors.directoryProximity = 0.4;
        } else {
            const relativePath = path.relative(currentDir, fileDir);
            const depth = relativePath.split(path.sep).length;
            factors.directoryProximity = Math.max(0, 0.3 - (depth * 0.1));
        }
        
        const currentName = path.basename(currentDocument.fileName, path.extname(currentDocument.fileName));
        const fileName = path.basename(file.fsPath, path.extname(file.fsPath));
        if (fileName.includes(currentName) || currentName.includes(fileName)) {
            factors.fileNameSimilarity = 0.3;
        } else {
            const similarity = this.calculateStringSimilarity(currentName, fileName);
            factors.fileNameSimilarity = similarity * 0.2;
        }
        
        const currentLang = currentDocument.languageId;
        const fileLang = this.getLanguageFromPath(file.fsPath);
        if (currentLang === fileLang) {
            factors.fileNameSimilarity += 0.1;
        }
        
        if (this.configManager.isFileMarkedImportant(file.fsPath)) {
            factors.userMarkedImportant = 0.5;
        }
        
        factors.recentEdits = this.calculateRecentEditsScore(file);
        
        factors.sharedSymbols = this.calculateSharedSymbolsScore(file, currentDocument);
        
        return factors;
    }
    
    private calculateStringSimilarity(str1: string, str2: string): number {
        const longer = str1.length > str2.length ? str1 : str2;
        const shorter = str1.length > str2.length ? str2 : str1;
        
        if (longer.length === 0) {
            return 1.0;
        }
        
        const editDistance = this.calculateLevenshteinDistance(longer, shorter);
        return (longer.length - editDistance) / longer.length;
    }
    
    private calculateLevenshteinDistance(str1: string, str2: string): number {
        const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
        
        for (let i = 0; i <= str1.length; i++) {
            matrix[0][i] = i;
        }
        
        for (let j = 0; j <= str2.length; j++) {
            matrix[j][0] = j;
        }
        
        for (let j = 1; j <= str2.length; j++) {
            for (let i = 1; i <= str1.length; i++) {
                const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
                matrix[j][i] = Math.min(
                    matrix[j][i - 1] + 1,
                    matrix[j - 1][i] + 1,
                    matrix[j - 1][i - 1] + indicator
                );
            }
        }
        
        return matrix[str2.length][str1.length];
    }
    
    private calculateRecentEditsScore(file: vscode.Uri): number {
        try {
            const stats = require('fs').statSync(file.fsPath);
            const now = Date.now();
            const fileModified = stats.mtime.getTime();
            const hoursSinceModified = (now - fileModified) / (1000 * 60 * 60);
            
            if (hoursSinceModified < 1) {
                return 0.4;
            } else if (hoursSinceModified < 24) {
                return 0.3;
            } else if (hoursSinceModified < 168) { // 1 week
                return 0.2;
            } else {
                return 0.1;
            }
        } catch {
            return 0.1;
        }
    }
    
    private calculateSharedSymbolsScore(file: vscode.Uri, currentDocument: vscode.TextDocument): number {
        try {
            const currentSymbols = this.extractSymbols(currentDocument.getText(), currentDocument.languageId);
            const fileContent = require('fs').readFileSync(file.fsPath, 'utf8');
            const fileSymbols = this.extractSymbols(fileContent, this.getLanguageFromPath(file.fsPath));
            
            const sharedSymbols = currentSymbols.filter(symbol => fileSymbols.includes(symbol));
            const totalSymbols = Math.max(currentSymbols.length, fileSymbols.length);
            
            if (totalSymbols === 0) {
                return 0;
            }
            
            const sharedRatio = sharedSymbols.length / totalSymbols;
            return Math.min(sharedRatio * 0.5, 0.3);
        } catch {
            return 0;
        }
    }
    
    private extractSymbols(content: string, language: string): string[] {
        const symbols: string[] = [];
        
        if (['typescript', 'javascript', 'tsx', 'jsx'].includes(language)) {
            const functionRegex = /(?:function\s+|const\s+|let\s+|var\s+)(\w+)/g;
            const classRegex = /class\s+(\w+)/g;
            const interfaceRegex = /interface\s+(\w+)/g;
            const typeRegex = /type\s+(\w+)/g;
            
            let match;
            while ((match = functionRegex.exec(content)) !== null) {
                symbols.push(match[1]);
            }
            while ((match = classRegex.exec(content)) !== null) {
                symbols.push(match[1]);
            }
            while ((match = interfaceRegex.exec(content)) !== null) {
                symbols.push(match[1]);
            }
            while ((match = typeRegex.exec(content)) !== null) {
                symbols.push(match[1]);
            }
        } else if (language === 'python') {
            const functionRegex = /def\s+(\w+)/g;
            const classRegex = /class\s+(\w+)/g;
            
            let match;
            while ((match = functionRegex.exec(content)) !== null) {
                symbols.push(match[1]);
            }
            while ((match = classRegex.exec(content)) !== null) {
                symbols.push(match[1]);
            }
        }
        
        return symbols;
    }
    
    private estimateTokens(relatedFiles: RelatedFile[], projectContext: string | any): number {
        let totalTokens = 0;
        
        relatedFiles.forEach(file => {
            totalTokens += Math.ceil(file.content.length / 4);
        });
        
        if (projectContext) {
            const contextStr = typeof projectContext === 'string' ? projectContext : JSON.stringify(projectContext);
            totalTokens += Math.ceil(contextStr.length / 4);
        }
        
        return totalTokens;
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
