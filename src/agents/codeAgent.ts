/**
 * Code Agent
 * 
 * This module implements an autonomous AI agent that can analyze, understand,
 * and work with codebases. It provides intelligent code analysis, pattern
 * recognition, and automated code improvements with user oversight.
 * 
 * Key features:
 * - Autonomous codebase analysis and understanding
 * - Code quality assessment and improvement suggestions
 * - Architecture pattern recognition and recommendations
 * - Security vulnerability detection
 * - Performance optimization suggestions
 * - Automated refactoring with user approval
 * 
 * @author SATISH KUMAR NADARAJAN (penintechwiz@gmail.com)
 * @version 1.0.0
 */

import * as vscode from 'vscode';
import { AIProvider, AIRequestContext } from '../providers/aiProvider';
import { Logger } from '../utils/logger';

/**
 * Code analysis result interface
 */
export interface CodeAnalysisResult {
    /** Analysis type performed */
    analysisType: string;
    
    /** Overall assessment score (0-100) */
    overallScore: number;
    
    /** Detailed findings */
    findings: CodeFinding[];
    
    /** Recommendations for improvement */
    recommendations: string[];
    
    /** Files analyzed */
    analyzedFiles: string[];
    
    /** Analysis timestamp */
    timestamp: Date;
    
    /** Summary of the analysis */
    summary: string;
}

/**
 * Individual code finding interface
 */
export interface CodeFinding {
    /** Finding type (e.g., 'security', 'performance', 'quality') */
    type: 'security' | 'performance' | 'quality' | 'architecture' | 'maintainability';
    
    /** Severity level */
    severity: 'low' | 'medium' | 'high' | 'critical';
    
    /** Finding title */
    title: string;
    
    /** Detailed description */
    description: string;
    
    /** File path where finding was detected */
    filePath?: string;
    
    /** Line number (if applicable) */
    lineNumber?: number;
    
    /** Code snippet related to the finding */
    codeSnippet?: string;
    
    /** Suggested fix or improvement */
    suggestedFix?: string;
}

/**
 * Workspace file information
 */
interface WorkspaceFile {
    /** Absolute file path */
    path: string;
    
    /** Relative path from workspace root */
    relativePath: string;
    
    /** File content */
    content: string;
    
    /** Programming language */
    language: string;
    
    /** File size in bytes */
    size: number;
}

/**
 * Code Agent Class
 * 
 * Implements autonomous code analysis and improvement capabilities.
 * Works with the AI provider to understand codebases and suggest improvements.
 */
export class CodeAgent {
    private aiProvider: AIProvider;
    private logger: Logger;
    private analysisCache: Map<string, CodeAnalysisResult> = new Map();
    private readonly maxFileSize = 100000; // 100KB max file size for analysis
    private readonly supportedExtensions = [
        '.ts', '.js', '.tsx', '.jsx', '.py', '.java', '.cs', '.cpp', '.c',
        '.go', '.rs', '.php', '.rb', '.swift', '.kt', '.scala', '.html',
        '.css', '.scss', '.less', '.json', '.yaml', '.yml', '.xml'
    ];

    /**
     * Initialize the code agent
     * 
     * @param aiProvider - AI provider for code analysis
     * @param logger - Logger instance for debugging
     */
    constructor(aiProvider: AIProvider, logger: Logger) {
        this.aiProvider = aiProvider;
        this.logger = logger;
        
        this.logger.info('🔧 Code Agent initialized');
    }

    /**
     * Analyze the current workspace
     * 
     * Performs comprehensive analysis of all code files in the workspace
     * and provides insights, recommendations, and improvement suggestions.
     * 
     * @param analysisType - Type of analysis to perform
     * @param cancellationToken - Cancellation token for long-running operations
     * @returns Promise resolving to analysis results
     */
    async analyzeWorkspace(
        analysisType: string,
        cancellationToken?: vscode.CancellationToken
    ): Promise<string> {
        
        try {
            this.logger.startTimer('workspace-analysis');
            this.logger.info(`Starting workspace analysis: ${analysisType}`);

            if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
                throw new Error('No workspace folder is open');
            }

            const workspaceFiles = await this.scanWorkspaceFiles(cancellationToken);
            
            if (workspaceFiles.length === 0) {
                return 'No code files found in the workspace to analyze.';
            }

            this.logger.info(`Found ${workspaceFiles.length} files to analyze`);

            if (cancellationToken?.isCancellationRequested) {
                throw new Error('Analysis cancelled by user');
            }

            const analysisResult = await this.performAIAnalysis(
                workspaceFiles,
                analysisType,
                cancellationToken
            );

            const cacheKey = `${analysisType}_${Date.now()}`;
            this.analysisCache.set(cacheKey, analysisResult);

            const formattedResults = this.formatAnalysisResults(analysisResult);

            this.logger.stopTimer('workspace-analysis');
            this.logger.info('✅ Workspace analysis completed successfully');

            return formattedResults;

        } catch (error) {
            this.logger.stopTimer('workspace-analysis');
            this.logger.error('Workspace analysis failed:', error);
            
            if (error instanceof Error && error.message.includes('cancelled')) {
                return 'Analysis was cancelled by the user.';
            }
            
            throw error;
        }
    }

    /**
     * Analyze a specific file
     * 
     * @param filePath - Path to the file to analyze
     * @param analysisType - Type of analysis to perform
     * @returns Promise resolving to analysis results
     */
    async analyzeFile(filePath: string, analysisType: string): Promise<CodeAnalysisResult> {
        try {
            this.logger.info(`Analyzing file: ${filePath} (${analysisType})`);

            const uri = vscode.Uri.file(filePath);
            const document = await vscode.workspace.openTextDocument(uri);
            const content = document.getText();

            const workspaceFile: WorkspaceFile = {
                path: filePath,
                relativePath: vscode.workspace.asRelativePath(filePath),
                content,
                language: document.languageId,
                size: Buffer.byteLength(content, 'utf8')
            };

            const result = await this.performAIAnalysis([workspaceFile], analysisType);
            
            this.logger.info('✅ File analysis completed');
            return result;

        } catch (error) {
            this.logger.error('File analysis failed:', error);
            throw error;
        }
    }

    /**
     * Get code improvement suggestions for selected text
     * 
     * @param code - Code to analyze
     * @param language - Programming language
     * @param context - Additional context
     * @returns Promise resolving to improvement suggestions
     */
    async getImprovementSuggestions(
        code: string,
        language: string,
        context?: AIRequestContext
    ): Promise<string[]> {
        
        try {
            this.logger.info(`Getting improvement suggestions for ${language} code`);

            const response = await this.aiProvider.refactorCode(
                code,
                language,
                'improve',
                context
            );

            const suggestions = this.parseImprovementSuggestions(response.content);
            
            this.logger.info(`Generated ${suggestions.length} improvement suggestions`);
            return suggestions;

        } catch (error) {
            this.logger.error('Failed to get improvement suggestions:', error);
            throw error;
        }
    }

    /**
     * Detect potential security vulnerabilities in code
     * 
     * @param workspaceFiles - Files to analyze for security issues
     * @returns Promise resolving to security findings
     */
    async detectSecurityVulnerabilities(workspaceFiles: WorkspaceFile[]): Promise<CodeFinding[]> {
        try {
            this.logger.info('Detecting security vulnerabilities');

            const securityFindings: CodeFinding[] = [];

            for (const file of workspaceFiles) {
                const findings = await this.analyzeFileForSecurity(file);
                securityFindings.push(...findings);
            }

            this.logger.info(`Found ${securityFindings.length} potential security issues`);
            return securityFindings;

        } catch (error) {
            this.logger.error('Security analysis failed:', error);
            throw error;
        }
    }

    /**
     * Scan workspace for code files
     * 
     * @param cancellationToken - Cancellation token
     * @returns Promise resolving to array of workspace files
     */
    private async scanWorkspaceFiles(
        cancellationToken?: vscode.CancellationToken
    ): Promise<WorkspaceFile[]> {
        
        const workspaceFiles: WorkspaceFile[] = [];
        
        if (!vscode.workspace.workspaceFolders) {
            return workspaceFiles;
        }

        const pattern = `**/*{${this.supportedExtensions.join(',')}}`;
        const files = await vscode.workspace.findFiles(
            pattern,
            '**/node_modules/**', // Exclude node_modules
            1000 // Limit to 1000 files for performance
        );

        this.logger.debug(`Found ${files.length} potential code files`);

        for (const fileUri of files) {
            if (cancellationToken?.isCancellationRequested) {
                break;
            }

            try {
                const document = await vscode.workspace.openTextDocument(fileUri);
                const content = document.getText();
                
                if (Buffer.byteLength(content, 'utf8') > this.maxFileSize) {
                    this.logger.debug(`Skipping large file: ${fileUri.fsPath}`);
                    continue;
                }

                if (content.trim().length === 0) {
                    continue;
                }

                const workspaceFile: WorkspaceFile = {
                    path: fileUri.fsPath,
                    relativePath: vscode.workspace.asRelativePath(fileUri),
                    content,
                    language: document.languageId,
                    size: Buffer.byteLength(content, 'utf8')
                };

                workspaceFiles.push(workspaceFile);

            } catch (error) {
                this.logger.warn(`Failed to read file ${fileUri.fsPath}:`, error);
            }
        }

        return workspaceFiles;
    }

    /**
     * Perform AI-powered analysis of workspace files
     * 
     * @param workspaceFiles - Files to analyze
     * @param analysisType - Type of analysis to perform
     * @param cancellationToken - Cancellation token
     * @returns Promise resolving to analysis results
     */
    private async performAIAnalysis(
        workspaceFiles: WorkspaceFile[],
        analysisType: string,
        cancellationToken?: vscode.CancellationToken
    ): Promise<CodeAnalysisResult> {
        
        const analysisFiles = workspaceFiles.map(file => ({
            path: file.relativePath,
            content: file.content.length > 5000 
                ? file.content.substring(0, 5000) + '\n... (truncated)'
                : file.content,
            language: file.language
        }));

        if (cancellationToken?.isCancellationRequested) {
            throw new Error('Analysis cancelled by user');
        }

        const response = await this.aiProvider.analyzeCodebase(analysisFiles, analysisType);

        const analysisResult = this.parseAnalysisResponse(
            response.content,
            analysisType,
            workspaceFiles.map(f => f.relativePath)
        );

        return analysisResult;
    }

    /**
     * Parse AI analysis response into structured results
     * 
     * @param aiResponse - Raw AI response
     * @param analysisType - Type of analysis performed
     * @param analyzedFiles - List of analyzed files
     * @returns Structured analysis results
     */
    private parseAnalysisResponse(
        aiResponse: string,
        analysisType: string,
        analyzedFiles: string[]
    ): CodeAnalysisResult {
        
        
        const findings: CodeFinding[] = [];
        const recommendations: string[] = [];
        
        const recommendationMatches = aiResponse.match(/(?:Recommendation|Suggest|Improve):\s*(.+)/gi);
        if (recommendationMatches) {
            recommendations.push(...recommendationMatches.map(match => 
                match.replace(/(?:Recommendation|Suggest|Improve):\s*/i, '').trim()
            ));
        }

        const issuePatterns = [
            /(?:Issue|Problem|Warning|Error):\s*(.+)/gi,
            /(?:Security|Performance|Quality)\s+(?:issue|problem):\s*(.+)/gi
        ];

        for (const pattern of issuePatterns) {
            const matches = aiResponse.match(pattern);
            if (matches) {
                findings.push(...matches.map(match => ({
                    type: this.inferFindingType(match),
                    severity: this.inferSeverity(match),
                    title: match.substring(0, 100),
                    description: match,
                    suggestedFix: 'Review and address this issue based on the analysis.'
                } as CodeFinding)));
            }
        }

        const overallScore = this.calculateOverallScore(findings);

        return {
            analysisType,
            overallScore,
            findings,
            recommendations,
            analyzedFiles,
            timestamp: new Date(),
            summary: this.generateAnalysisSummary(aiResponse, findings.length, recommendations.length)
        };
    }

    /**
     * Infer finding type from text
     * 
     * @param text - Text to analyze
     * @returns Finding type
     */
    private inferFindingType(text: string): CodeFinding['type'] {
        const lowerText = text.toLowerCase();
        
        if (lowerText.includes('security') || lowerText.includes('vulnerability')) {
            return 'security';
        }
        if (lowerText.includes('performance') || lowerText.includes('slow')) {
            return 'performance';
        }
        if (lowerText.includes('architecture') || lowerText.includes('design')) {
            return 'architecture';
        }
        if (lowerText.includes('maintain') || lowerText.includes('complex')) {
            return 'maintainability';
        }
        
        return 'quality';
    }

    /**
     * Infer severity from text
     * 
     * @param text - Text to analyze
     * @returns Severity level
     */
    private inferSeverity(text: string): CodeFinding['severity'] {
        const lowerText = text.toLowerCase();
        
        if (lowerText.includes('critical') || lowerText.includes('severe')) {
            return 'critical';
        }
        if (lowerText.includes('high') || lowerText.includes('important')) {
            return 'high';
        }
        if (lowerText.includes('medium') || lowerText.includes('moderate')) {
            return 'medium';
        }
        
        return 'low';
    }

    /**
     * Calculate overall score based on findings
     * 
     * @param findings - Array of code findings
     * @returns Overall score (0-100)
     */
    private calculateOverallScore(findings: CodeFinding[]): number {
        if (findings.length === 0) {
            return 95; // High score if no issues found
        }

        let penalty = 0;
        for (const finding of findings) {
            switch (finding.severity) {
                case 'critical':
                    penalty += 20;
                    break;
                case 'high':
                    penalty += 10;
                    break;
                case 'medium':
                    penalty += 5;
                    break;
                case 'low':
                    penalty += 2;
                    break;
            }
        }

        return Math.max(0, 100 - penalty);
    }

    /**
     * Generate analysis summary
     * 
     * @param aiResponse - AI response content
     * @param findingsCount - Number of findings
     * @param recommendationsCount - Number of recommendations
     * @returns Summary string
     */
    private generateAnalysisSummary(
        aiResponse: string,
        findingsCount: number,
        recommendationsCount: number
    ): string {
        
        const paragraphs = aiResponse.split('\n\n');
        const firstParagraph = paragraphs[0]?.trim();
        
        if (firstParagraph && firstParagraph.length > 50 && firstParagraph.length < 300) {
            return firstParagraph;
        }

        return `Analysis completed with ${findingsCount} findings and ${recommendationsCount} recommendations. ` +
               `Review the detailed results for specific areas of improvement.`;
    }

    /**
     * Format analysis results for display
     * 
     * @param result - Analysis result to format
     * @returns Formatted markdown string
     */
    private formatAnalysisResults(result: CodeAnalysisResult): string {
        const timestamp = result.timestamp.toLocaleString();
        
        let markdown = `# 🔍 Code Analysis Report: ${result.analysisType}

*Generated on ${timestamp}*

## 📊 Overall Assessment

**Score:** ${result.overallScore}/100  
**Files Analyzed:** ${result.analyzedFiles.length}  
**Issues Found:** ${result.findings.length}  
**Recommendations:** ${result.recommendations.length}

## 📝 Summary

${result.summary}

`;

        if (result.findings.length > 0) {
            markdown += `## 🔍 Findings

`;
            
            const groupedFindings = this.groupFindingsBySeverity(result.findings);
            
            for (const [severity, findings] of Object.entries(groupedFindings)) {
                if (findings.length > 0) {
                    const severityEmoji = {
                        critical: '🚨',
                        high: '⚠️',
                        medium: '⚡',
                        low: 'ℹ️'
                    };
                    
                    markdown += `### ${severityEmoji[severity as keyof typeof severityEmoji]} ${severity.toUpperCase()} (${findings.length})

`;
                    
                    for (const finding of findings) {
                        markdown += `- **${finding.title}**\n`;
                        if (finding.filePath) {
                            markdown += `  - File: \`${finding.filePath}\`\n`;
                        }
                        if (finding.lineNumber) {
                            markdown += `  - Line: ${finding.lineNumber}\n`;
                        }
                        markdown += `  - ${finding.description}\n`;
                        if (finding.suggestedFix) {
                            markdown += `  - *Suggested fix: ${finding.suggestedFix}*\n`;
                        }
                        markdown += '\n';
                    }
                }
            }
        }

        if (result.recommendations.length > 0) {
            markdown += `## 💡 Recommendations

`;
            for (let i = 0; i < result.recommendations.length; i++) {
                markdown += `${i + 1}. ${result.recommendations[i]}\n`;
            }
            markdown += '\n';
        }

        markdown += `## 📁 Analyzed Files

`;
        for (const file of result.analyzedFiles) {
            markdown += `- \`${file}\`\n`;
        }

        markdown += `

---

*This analysis was generated by AI Copilot Extension. Please review and verify the findings before taking action.*

### Next Steps:
1. Review the findings and prioritize based on severity
2. Address critical and high-severity issues first
3. Consider implementing the recommendations
4. Re-run analysis after making changes to track improvements
`;

        return markdown;
    }

    /**
     * Group findings by severity
     * 
     * @param findings - Array of findings
     * @returns Findings grouped by severity
     */
    private groupFindingsBySeverity(findings: CodeFinding[]): Record<string, CodeFinding[]> {
        const grouped: Record<string, CodeFinding[]> = {
            critical: [],
            high: [],
            medium: [],
            low: []
        };

        for (const finding of findings) {
            grouped[finding.severity].push(finding);
        }

        return grouped;
    }

    /**
     * Parse improvement suggestions from AI response
     * 
     * @param response - AI response content
     * @returns Array of improvement suggestions
     */
    private parseImprovementSuggestions(response: string): string[] {
        const suggestions: string[] = [];
        
        const lines = response.split('\n');
        
        for (const line of lines) {
            const trimmed = line.trim();
            
            if (trimmed.match(/^\d+\.\s+/) || 
                trimmed.match(/^[-*]\s+/) || 
                trimmed.toLowerCase().includes('suggest') ||
                trimmed.toLowerCase().includes('recommend') ||
                trimmed.toLowerCase().includes('improve')) {
                
                const suggestion = trimmed.replace(/^\d+\.\s+|^[-*]\s+/, '').trim();
                if (suggestion.length > 10) {
                    suggestions.push(suggestion);
                }
            }
        }

        return suggestions;
    }

    /**
     * Analyze a file for security vulnerabilities
     * 
     * @param file - File to analyze
     * @returns Promise resolving to security findings
     */
    private async analyzeFileForSecurity(file: WorkspaceFile): Promise<CodeFinding[]> {
        const findings: CodeFinding[] = [];
        
        const securityPatterns = [
            {
                pattern: /eval\s*\(/gi,
                title: 'Use of eval() function',
                description: 'The eval() function can execute arbitrary code and poses security risks',
                severity: 'high' as const
            },
            {
                pattern: /innerHTML\s*=/gi,
                title: 'Direct innerHTML assignment',
                description: 'Direct innerHTML assignment can lead to XSS vulnerabilities',
                severity: 'medium' as const
            },
            {
                pattern: /document\.write\s*\(/gi,
                title: 'Use of document.write()',
                description: 'document.write() can be exploited for XSS attacks',
                severity: 'medium' as const
            },
            {
                pattern: /password\s*=\s*["'][^"']+["']/gi,
                title: 'Hardcoded password',
                description: 'Passwords should not be hardcoded in source code',
                severity: 'critical' as const
            }
        ];

        const lines = file.content.split('\n');
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            for (const securityPattern of securityPatterns) {
                if (securityPattern.pattern.test(line)) {
                    findings.push({
                        type: 'security',
                        severity: securityPattern.severity,
                        title: securityPattern.title,
                        description: securityPattern.description,
                        filePath: file.relativePath,
                        lineNumber: i + 1,
                        codeSnippet: line.trim(),
                        suggestedFix: 'Review this code for security implications and consider safer alternatives'
                    });
                }
            }
        }

        return findings;
    }

    /**
     * Clear analysis cache
     */
    clearCache(): void {
        this.analysisCache.clear();
        this.logger.info('Analysis cache cleared');
    }

    /**
     * Get cached analysis results
     * 
     * @returns Array of cached analysis results
     */
    getCachedResults(): CodeAnalysisResult[] {
        return Array.from(this.analysisCache.values());
    }

    /**
     * Dispose of resources
     */
    dispose(): void {
        this.clearCache();
        this.logger.info('Code Agent disposed');
    }
}
