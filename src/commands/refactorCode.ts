/**
 * Refactor Code Command
 * 
 * This module implements the AI-powered code refactoring command that helps users
 * improve their code quality, readability, and performance. It analyzes selected
 * code and provides intelligent refactoring suggestions.
 * 
 * Key features:
 * - Multiple refactoring types (optimize, clean, modernize, etc.)
 * - Context-aware refactoring based on programming language
 * - Preservation of original functionality
 * - Before/after comparison with diff view
 * - Undo support and safety checks
 * 
 * @author SATISH KUMAR NADARAJAN (penintechwiz@gmail.com)
 * @version 1.0.0
 */

import * as vscode from 'vscode';
import { AIProvider, AIRequestContext } from '../providers/aiProvider';
import { Logger } from '../utils/logger';

/**
 * Available refactoring types
 */
const REFACTOR_TYPES = [
    {
        id: 'optimize',
        label: 'Optimize Performance',
        description: 'Improve code performance and efficiency',
        icon: '⚡'
    },
    {
        id: 'clean',
        label: 'Clean Code',
        description: 'Improve readability and maintainability',
        icon: '🧹'
    },
    {
        id: 'modernize',
        label: 'Modernize Syntax',
        description: 'Update to modern language features',
        icon: '🔄'
    },
    {
        id: 'extract',
        label: 'Extract Functions',
        description: 'Break down complex code into smaller functions',
        icon: '📦'
    },
    {
        id: 'simplify',
        label: 'Simplify Logic',
        description: 'Reduce complexity and improve clarity',
        icon: '🎯'
    },
    {
        id: 'security',
        label: 'Security Improvements',
        description: 'Fix security vulnerabilities and improve safety',
        icon: '🔒'
    }
];

/**
 * Refactor code command handler
 * 
 * This function handles the "Refactor Selected Code" command. It analyzes
 * the selected code and provides AI-powered refactoring suggestions.
 * 
 * @param aiProvider - AI provider instance for code refactoring
 * @param logger - Logger instance for debugging and monitoring
 */
export async function refactorCodeCommand(aiProvider: AIProvider, logger: Logger): Promise<void> {
    try {
        logger.logUserAction('refactor-code-command');
        logger.startTimer('refactor-code');

        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('Please open a file to refactor code.');
            logger.warn('Refactor code command called without active editor');
            return;
        }

        const selection = editor.selection;
        if (selection.isEmpty) {
            vscode.window.showWarningMessage('Please select the code you want to refactor.');
            logger.warn('Refactor code command called without text selection');
            return;
        }

        const selectedCode = editor.document.getText(selection);
        const language = editor.document.languageId;

        logger.info(`Refactoring ${language} code (${selectedCode.length} characters)`);

        const refactorType = await selectRefactorType();
        if (!refactorType) {
            logger.debug('Refactor code command cancelled by user');
            return;
        }

        const context = extractRefactorContext(editor, selection);

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `${refactorType.icon} Refactoring code...`,
            cancellable: true
        }, async (progress, token) => {
            
            progress.report({ increment: 0, message: 'Analyzing code...' });

            try {
                const response = await aiProvider.refactorCode(
                    selectedCode,
                    language,
                    refactorType.id,
                    context
                );

                if (token.isCancellationRequested) {
                    logger.debug('Code refactoring cancelled by user');
                    return;
                }

                progress.report({ increment: 70, message: 'Processing suggestions...' });

                const refactoredCode = extractRefactoredCode(response.content, language);

                const userChoice = await showRefactorComparison(
                    selectedCode,
                    refactoredCode,
                    refactorType,
                    language
                );

                if (userChoice === 'apply') {
                    progress.report({ increment: 90, message: 'Applying changes...' });

                    await applyRefactoredCode(editor, selection, refactoredCode);

                    progress.report({ increment: 100, message: 'Refactoring complete!' });

                    const tokenInfo = response.usage 
                        ? ` (${response.usage.totalTokens} tokens used)`
                        : '';
                        
                    vscode.window.showInformationMessage(
                        `✅ Code refactored successfully!${tokenInfo}`,
                        'Undo',
                        'Refactor More'
                    ).then(action => {
                        if (action === 'Undo') {
                            vscode.commands.executeCommand('undo');
                        } else if (action === 'Refactor More') {
                            refactorCodeCommand(aiProvider, logger);
                        }
                    });

                    logger.info('✅ Code refactoring completed successfully');
                } else {
                    progress.report({ increment: 100, message: 'Refactoring cancelled' });
                    logger.debug('User cancelled refactoring after preview');
                }

            } catch (error) {
                progress.report({ increment: 100, message: 'Refactoring failed' });
                throw error;
            }
        });

    } catch (error) {
        logger.error('Code refactoring failed:', error);
        
        let errorMessage = 'Failed to refactor code. ';
        
        if (error instanceof Error) {
            if (error.message.includes('API key')) {
                errorMessage += 'Please check your API key configuration.';
                vscode.window.showErrorMessage(errorMessage, 'Open Settings').then(action => {
                    if (action === 'Open Settings') {
                        vscode.commands.executeCommand('workbench.action.openSettings', 'aiCopilot.apiKey');
                    }
                });
            } else if (error.message.includes('rate limit')) {
                errorMessage += 'Rate limit exceeded. Please try again later.';
                vscode.window.showWarningMessage(errorMessage);
            } else {
                errorMessage += 'Please try again or check the logs for details.';
                vscode.window.showErrorMessage(errorMessage, 'View Logs').then(action => {
                    if (action === 'View Logs') {
                        logger.show();
                    }
                });
            }
        } else {
            vscode.window.showErrorMessage(errorMessage);
        }

    } finally {
        logger.stopTimer('refactor-code');
    }
}

/**
 * Let user select the type of refactoring to perform
 * 
 * @returns Promise resolving to selected refactor type or undefined if cancelled
 */
async function selectRefactorType(): Promise<typeof REFACTOR_TYPES[0] | undefined> {
    const quickPickItems = REFACTOR_TYPES.map(type => ({
        label: `${type.icon} ${type.label}`,
        description: type.description,
        refactorType: type
    }));

    const selected = await vscode.window.showQuickPick(quickPickItems, {
        title: 'Select Refactoring Type',
        placeHolder: 'Choose how you want to refactor the selected code'
    });

    return selected?.refactorType;
}

/**
 * Extract context for refactoring from the current editor
 * 
 * @param editor - VS Code text editor instance
 * @param selection - Current text selection
 * @returns AI request context object
 */
function extractRefactorContext(editor: vscode.TextEditor, selection: vscode.Range): AIRequestContext {
    const document = editor.document;

    const selectedText = document.getText(selection);

    const contextLines = 20; // More context for better refactoring
    const startLine = Math.max(0, selection.start.line - contextLines);
    const endLine = Math.min(document.lineCount - 1, selection.end.line + contextLines);
    
    const surroundingCode = document.getText(new vscode.Range(
        new vscode.Position(startLine, 0),
        new vscode.Position(endLine, document.lineAt(endLine).text.length)
    ));

    const maxFileSize = 10000; // Larger context for refactoring
    const fullText = document.getText();
    const currentFile = fullText.length > maxFileSize 
        ? fullText.substring(0, maxFileSize) + '\n... (truncated)'
        : fullText;

    const workspaceName = vscode.workspace.name || 'Unknown';
    const relativePath = vscode.workspace.asRelativePath(document.fileName);
    const projectContext = `Workspace: ${workspaceName}, File: ${relativePath}`;

    return {
        currentFile,
        selectedText,
        language: document.languageId,
        cursorPosition: document.offsetAt(selection.start),
        surroundingCode,
        projectContext
    };
}

/**
 * Extract refactored code from AI response
 * 
 * @param response - AI response content
 * @param language - Programming language
 * @returns Cleaned refactored code
 */
function extractRefactoredCode(response: string, language: string): string {
    let code = response;

    const codeBlockRegex = new RegExp(`\`\`\`(?:${language})?\\s*\\n?([\\s\\S]*?)\\n?\`\`\``, 'gi');
    const match = codeBlockRegex.exec(code);
    if (match) {
        code = match[1];
    }

    code = code.replace(/`([^`]+)`/g, '$1');

    const explanationPatterns = [
        /^Here's the refactored code:?\s*/i,
        /^The refactored code is:?\s*/i,
        /^Refactored version:?\s*/i,
        /^Here's an improved version:?\s*/i
    ];

    for (const pattern of explanationPatterns) {
        code = code.replace(pattern, '');
    }

    code = code.trim().replace(/\r\n/g, '\n');

    return code;
}

/**
 * Show before/after comparison of the refactored code
 * 
 * @param originalCode - Original code
 * @param refactoredCode - Refactored code
 * @param refactorType - Type of refactoring performed
 * @param language - Programming language
 * @returns Promise resolving to user choice ('apply' or 'cancel')
 */
async function showRefactorComparison(
    originalCode: string,
    refactoredCode: string,
    refactorType: typeof REFACTOR_TYPES[0],
    language: string
): Promise<'apply' | 'cancel' | undefined> {
    
    const originalDoc = await vscode.workspace.openTextDocument({
        content: originalCode,
        language: language
    });

    const refactoredDoc = await vscode.workspace.openTextDocument({
        content: refactoredCode,
        language: language
    });

    await vscode.commands.executeCommand(
        'vscode.diff',
        originalDoc.uri,
        refactoredDoc.uri,
        `${refactorType.icon} Refactoring Preview: ${refactorType.label}`
    );

    const choice = await vscode.window.showInformationMessage(
        `${refactorType.icon} Review the refactored code. Do you want to apply these changes?`,
        { modal: true },
        'Apply Changes',
        'Cancel'
    );

    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');

    return choice === 'Apply Changes' ? 'apply' : 'cancel';
}

/**
 * Apply refactored code to the editor
 * 
 * @param editor - VS Code text editor instance
 * @param selection - Original selection range
 * @param refactoredCode - Refactored code to apply
 */
async function applyRefactoredCode(
    editor: vscode.TextEditor,
    selection: vscode.Range,
    refactoredCode: string
): Promise<void> {
    
    const originalLine = editor.document.lineAt(selection.start.line);
    const indentation = originalLine.text.match(/^(\s*)/)?.[1] || '';
    
    const indentedCode = indentRefactoredCode(refactoredCode, indentation);

    await editor.edit(editBuilder => {
        editBuilder.replace(selection, indentedCode);
    });

    const lines = indentedCode.split('\n');
    const endPosition = new vscode.Position(
        selection.start.line + lines.length - 1,
        lines.length === 1 
            ? selection.start.character + lines[0].length 
            : lines[lines.length - 1].length
    );
    
    editor.selection = new vscode.Selection(selection.start, endPosition);

    try {
        await vscode.commands.executeCommand('editor.action.formatSelection');
    } catch (error) {
        console.debug('Code formatting failed:', error);
    }
}

/**
 * Apply proper indentation to refactored code
 * 
 * @param code - Refactored code
 * @param baseIndentation - Base indentation string
 * @returns Properly indented code
 */
function indentRefactoredCode(code: string, baseIndentation: string): string {
    const lines = code.split('\n');
    
    return lines.map((line, _index) => {
        if (line.trim() === '') {
            return line; // Preserve empty lines
        }
        
        return baseIndentation + line;
    }).join('\n');
}

/**
 * Get file extension for a programming language (reserved for future use)
 * 
 * @param language - Programming language ID
 * @returns File extension string
 */
// function getFileExtension(language: string): string {
//     const extensions: Record<string, string> = {
//         'typescript': 'ts',
//         'javascript': 'js',
//         'python': 'py',
//         'java': 'java',
//         'csharp': 'cs',
//         'cpp': 'cpp',
//         'c': 'c',
//         'go': 'go',
//         'rust': 'rs',
//         'php': 'php',
//         'ruby': 'rb',
//         'swift': 'swift',
//         'kotlin': 'kt',
//         'scala': 'scala',
//         'html': 'html',
//         'css': 'css',
//         'scss': 'scss',
//         'json': 'json',
//         'yaml': 'yml',
//         'xml': 'xml',
//         'markdown': 'md'
//     };

//     return extensions[language] || 'txt';
// }

/**
 * Analyze code complexity before refactoring
 * 
 * Provides basic complexity analysis to help determine the best refactoring approach.
 * 
 * @param code - Code to analyze
 * @param language - Programming language
 * @returns Complexity analysis object
 */
// function analyzeCodeComplexity(code: string, language: string): {
//     lineCount: number;
//     cyclomaticComplexity: number;
//     suggestions: string[];
// } {
//     const lines = code.split('\n').filter(line => line.trim().length > 0);
//     const lineCount = lines.length;
//     
//     const complexityKeywords = ['if', 'else', 'while', 'for', 'switch', 'case', 'catch', 'try'];
//     let cyclomaticComplexity = 1; // Base complexity
//     
//     for (const line of lines) {
//         for (const keyword of complexityKeywords) {
//             if (line.includes(keyword)) {
//                 cyclomaticComplexity++;
//             }
//         }
//     }
//     
//     const suggestions: string[] = [];
//     
//     if (lineCount > 50) {
//         suggestions.push('Consider breaking this into smaller functions');
//     }
//     
//     if (cyclomaticComplexity > 10) {
//         suggestions.push('High complexity detected - consider simplifying logic');
//     }
//     
//     if (code.includes('TODO') || code.includes('FIXME')) {
//         suggestions.push('Address TODO/FIXME comments during refactoring');
//     }
//     
//     return {
//         lineCount,
//         cyclomaticComplexity,
//         suggestions
//     };
// }
