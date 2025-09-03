/**
 * Generate Code Command
 * 
 * This module implements the AI-powered code generation command that allows users
 * to generate code from natural language descriptions. It handles user input,
 * context extraction, AI interaction, and code insertion.
 * 
 * Key features:
 * - Natural language to code conversion
 * - Context-aware code generation based on current file
 * - Support for multiple programming languages
 * - Intelligent code insertion at cursor position
 * - Error handling and user feedback
 * 
 * @author SATISH KUMAR NADARAJAN (penintechwiz@gmail.com)
 * @version 1.0.0
 */

import * as vscode from 'vscode';
import { AIProvider, AIRequestContext } from '../providers/aiProvider';
import { Logger } from '../utils/logger';

/**
 * Generate code command handler
 * 
 * This function handles the "Generate Code with AI" command. It prompts the user
 * for a description of what they want to generate, uses AI to create the code,
 * and inserts it at the current cursor position.
 * 
 * @param aiProvider - AI provider instance for code generation
 * @param logger - Logger instance for debugging and monitoring
 */
export async function generateCodeCommand(aiProvider: AIProvider, logger: Logger): Promise<void> {
    try {
        logger.logUserAction('generate-code-command');
        logger.startTimer('generate-code');

        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('Please open a file to generate code.');
            logger.warn('Generate code command called without active editor');
            return;
        }

        const prompt = await getUserPrompt();
        if (!prompt) {
            logger.debug('Generate code command cancelled by user');
            return;
        }

        const context = extractEditorContext(editor);
        
        const language = editor.document.languageId || 'text';
        
        logger.info(`Generating ${language} code for prompt: "${prompt}"`);

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Generating code with AI...',
            cancellable: true
        }, async (progress, token) => {
            
            progress.report({ increment: 0, message: 'Processing request...' });

            try {
                const response = await aiProvider.generateCode(prompt, language, context);
                
                if (token.isCancellationRequested) {
                    logger.debug('Code generation cancelled by user');
                    return;
                }

                progress.report({ increment: 80, message: 'Inserting code...' });

                await insertGeneratedCode(editor, response.content);

                progress.report({ increment: 100, message: 'Code generated successfully!' });

                const tokenInfo = response.usage 
                    ? ` (${response.usage.totalTokens} tokens used)`
                    : '';
                    
                vscode.window.showInformationMessage(
                    `✅ Code generated successfully!${tokenInfo}`,
                    'Undo',
                    'Generate More'
                ).then(action => {
                    if (action === 'Undo') {
                        vscode.commands.executeCommand('undo');
                    } else if (action === 'Generate More') {
                        generateCodeCommand(aiProvider, logger);
                    }
                });

                logger.info('✅ Code generation completed successfully');

            } catch (error) {
                progress.report({ increment: 100, message: 'Generation failed' });
                throw error;
            }
        });

    } catch (error) {
        logger.error('Code generation failed:', error);
        
        let errorMessage = 'Failed to generate code. ';
        
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
        logger.stopTimer('generate-code');
    }
}

/**
 * Get user prompt for code generation
 * 
 * Prompts the user to enter a description of the code they want to generate.
 * Provides helpful placeholder text and validation.
 * 
 * @returns Promise resolving to user prompt or undefined if cancelled
 */
async function getUserPrompt(): Promise<string | undefined> {
    const prompt = await vscode.window.showInputBox({
        title: 'Generate Code with AI',
        prompt: 'Describe the code you want to generate',
        placeHolder: 'e.g., "Create a function that sorts an array of objects by date"',
        validateInput: (value: string) => {
            if (!value || value.trim().length === 0) {
                return 'Please enter a description of the code to generate';
            }
            if (value.trim().length < 10) {
                return 'Please provide a more detailed description (at least 10 characters)';
            }
            return null;
        }
    });

    return prompt?.trim();
}

/**
 * Extract context from the current editor
 * 
 * Gathers relevant context information from the current editor state
 * to help the AI generate more appropriate code.
 * 
 * @param editor - VS Code text editor instance
 * @returns AI request context object
 */
function extractEditorContext(editor: vscode.TextEditor): AIRequestContext {
    const document = editor.document;
    const selection = editor.selection;
    const position = selection.active;

    const selectedText = selection.isEmpty ? undefined : document.getText(selection);

    const maxFileSize = 5000; // Limit file content to 5000 characters
    const fullText = document.getText();
    const currentFile = fullText.length > maxFileSize 
        ? fullText.substring(0, maxFileSize) + '\n... (truncated)'
        : fullText;

    const contextLines = 10; // Number of lines before and after cursor
    const startLine = Math.max(0, position.line - contextLines);
    const endLine = Math.min(document.lineCount - 1, position.line + contextLines);
    
    const surroundingCode = document.getText(new vscode.Range(
        new vscode.Position(startLine, 0),
        new vscode.Position(endLine, document.lineAt(endLine).text.length)
    ));

    const workspaceName = vscode.workspace.name || 'Unknown';
    const relativePath = vscode.workspace.asRelativePath(document.fileName);
    const projectContext = `Workspace: ${workspaceName}, File: ${relativePath}`;

    return {
        currentFile,
        selectedText,
        language: document.languageId,
        cursorPosition: document.offsetAt(position),
        surroundingCode,
        projectContext
    };
}

/**
 * Insert generated code into the editor
 * 
 * Handles the insertion of AI-generated code at the appropriate location
 * in the editor, with proper formatting and indentation.
 * 
 * @param editor - VS Code text editor instance
 * @param generatedCode - Code generated by AI
 */
async function insertGeneratedCode(editor: vscode.TextEditor, generatedCode: string): Promise<void> {
    const document = editor.document;
    const selection = editor.selection;

    const cleanCode = cleanGeneratedCode(generatedCode, document.languageId);

    let insertPosition: vscode.Position;
    let replaceRange: vscode.Range | undefined;

    if (!selection.isEmpty) {
        replaceRange = selection;
        insertPosition = selection.start;
    } else {
        insertPosition = selection.active;
    }

    const indentation = getIndentationAtPosition(document, insertPosition);
    const indentedCode = indentCode(cleanCode, indentation, document.languageId);

    await editor.edit(editBuilder => {
        if (replaceRange) {
            editBuilder.replace(replaceRange, indentedCode);
        } else {
            editBuilder.insert(insertPosition, indentedCode);
        }
    });

    const lines = indentedCode.split('\n');
    const lastLine = lines[lines.length - 1];
    const newPosition = new vscode.Position(
        insertPosition.line + lines.length - 1,
        lines.length === 1 ? insertPosition.character + lastLine.length : lastLine.length
    );
    
    editor.selection = new vscode.Selection(newPosition, newPosition);

    try {
        await vscode.commands.executeCommand('editor.action.formatSelection');
    } catch (error) {
        console.debug('Code formatting failed:', error);
    }
}

/**
 * Clean generated code by removing markdown formatting and extra whitespace
 * 
 * @param code - Raw generated code from AI
 * @param language - Programming language
 * @returns Cleaned code string
 */
function cleanGeneratedCode(code: string, language: string): string {
    let cleaned = code;

    const codeBlockRegex = new RegExp(`\`\`\`(?:${language})?\\s*\\n?([\\s\\S]*?)\\n?\`\`\``, 'gi');
    const match = codeBlockRegex.exec(cleaned);
    if (match) {
        cleaned = match[1];
    }

    cleaned = cleaned.replace(/`([^`]+)`/g, '$1');

    cleaned = cleaned.trim();

    cleaned = cleaned.replace(/\r\n/g, '\n');

    return cleaned;
}

/**
 * Get indentation at a specific position in the document
 * 
 * @param document - VS Code text document
 * @param position - Position to check indentation
 * @returns Indentation string (spaces or tabs)
 */
function getIndentationAtPosition(document: vscode.TextDocument, position: vscode.Position): string {
    const line = document.lineAt(position.line);
    const lineText = line.text;
    
    const match = lineText.match(/^(\s*)/);
    return match ? match[1] : '';
}

/**
 * Indent code with the specified indentation
 * 
 * @param code - Code to indent
 * @param baseIndentation - Base indentation string
 * @param language - Programming language for smart indentation
 * @returns Indented code string
 */
function indentCode(code: string, baseIndentation: string, _language: string): string {
    const lines = code.split('\n');
    
    if (lines.length === 1) {
        return code;
    }

    const indentedLines = lines.map((line, index) => {
        if (index === 0 && line.trim() === '') {
            return line;
        }
        return line.trim() === '' ? line : baseIndentation + line;
    });

    return indentedLines.join('\n');
}

/**
 * Show code generation options to the user
 * 
 * Provides additional options for code generation, such as different
 * generation styles or post-processing options.
 * 
 * @returns Promise resolving to selected options or undefined
 */
// async function getGenerationOptions(): Promise<{
//     style: string;
//     includeComments: boolean;
//     includeTests: boolean;
// } | undefined> {
//     
//     const style = await vscode.window.showQuickPick([
//         { label: 'Clean & Simple', description: 'Generate clean, minimal code' },
//         { label: 'Detailed & Documented', description: 'Include detailed comments and documentation' },
//         { label: 'Production Ready', description: 'Include error handling and best practices' }
//     ], {
//         title: 'Code Generation Style',
//         placeHolder: 'Select the style for generated code'
//     });

//     if (!style) {
//         return undefined;
//     }

//     const includeComments = style.label === 'Detailed & Documented' || style.label === 'Production Ready';
//     const includeTests = style.label === 'Production Ready';

//     return {
//         style: style.label,
//         includeComments,
//         includeTests
//     };
// }
