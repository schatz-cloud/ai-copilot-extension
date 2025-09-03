/**
 * Explain Code Command
 * 
 * This module implements the AI-powered code explanation command that helps users
 * understand code functionality, logic, and implementation details. It provides
 * comprehensive explanations in natural language.
 * 
 * Key features:
 * - Detailed code analysis and explanation
 * - Context-aware explanations based on surrounding code
 * - Support for multiple programming languages
 * - Interactive explanation with follow-up questions
 * - Documentation generation capabilities
 * 
 * @author SATISH KUMAR NADARAJAN (penintechwiz@gmail.com)
 * @version 1.0.0
 */

import * as vscode from 'vscode';
import { AIProvider, AIRequestContext } from '../providers/aiProvider';
import { Logger } from '../utils/logger';

/**
 * Explanation detail levels
 */
const EXPLANATION_LEVELS = [
    {
        id: 'basic',
        label: 'Basic Overview',
        description: 'High-level explanation of what the code does',
        icon: '📝'
    },
    {
        id: 'detailed',
        label: 'Detailed Analysis',
        description: 'Line-by-line breakdown with logic explanation',
        icon: '🔍'
    },
    {
        id: 'beginner',
        label: 'Beginner Friendly',
        description: 'Simple explanation with programming concepts',
        icon: '🎓'
    },
    {
        id: 'expert',
        label: 'Expert Analysis',
        description: 'Technical deep-dive with patterns and best practices',
        icon: '🧠'
    }
];

/**
 * Explain code command handler
 * 
 * This function handles the "Explain Selected Code" command. It analyzes
 * the selected code and provides AI-powered explanations.
 * 
 * @param aiProvider - AI provider instance for code explanation
 * @param logger - Logger instance for debugging and monitoring
 */
export async function explainCodeCommand(aiProvider: AIProvider, logger: Logger): Promise<void> {
    try {
        logger.logUserAction('explain-code-command');
        logger.startTimer('explain-code');

        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('Please open a file to explain code.');
            logger.warn('Explain code command called without active editor');
            return;
        }

        const selection = editor.selection;
        if (selection.isEmpty) {
            vscode.window.showWarningMessage('Please select the code you want explained.');
            logger.warn('Explain code command called without text selection');
            return;
        }

        const selectedCode = editor.document.getText(selection);
        const language = editor.document.languageId;

        logger.info(`Explaining ${language} code (${selectedCode.length} characters)`);

        const explanationLevel = await selectExplanationLevel();
        if (!explanationLevel) {
            logger.debug('Explain code command cancelled by user');
            return;
        }

        const context = extractExplanationContext(editor, selection);

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `${explanationLevel.icon} Analyzing code...`,
            cancellable: true
        }, async (progress, token) => {
            
            progress.report({ increment: 0, message: 'Processing code...' });

            try {
                const response = await aiProvider.explainCode(
                    selectedCode,
                    language,
                    {
                        ...context,
                        projectContext: `${context.projectContext}\nExplanation Level: ${explanationLevel.label}`
                    }
                );

                if (token.isCancellationRequested) {
                    logger.debug('Code explanation cancelled by user');
                    return;
                }

                progress.report({ increment: 80, message: 'Formatting explanation...' });

                await displayExplanation(
                    response.content,
                    selectedCode,
                    language,
                    explanationLevel,
                    response.usage
                );

                progress.report({ increment: 100, message: 'Explanation complete!' });

                logger.info('✅ Code explanation completed successfully');

            } catch (error) {
                progress.report({ increment: 100, message: 'Explanation failed' });
                throw error;
            }
        });

    } catch (error) {
        logger.error('Code explanation failed:', error);
        
        let errorMessage = 'Failed to explain code. ';
        
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
        logger.stopTimer('explain-code');
    }
}

/**
 * Let user select the level of explanation detail
 * 
 * @returns Promise resolving to selected explanation level or undefined if cancelled
 */
async function selectExplanationLevel(): Promise<typeof EXPLANATION_LEVELS[0] | undefined> {
    const quickPickItems = EXPLANATION_LEVELS.map(level => ({
        label: `${level.icon} ${level.label}`,
        description: level.description,
        explanationLevel: level
    }));

    const selected = await vscode.window.showQuickPick(quickPickItems, {
        title: 'Select Explanation Level',
        placeHolder: 'Choose how detailed you want the code explanation to be'
    });

    return selected?.explanationLevel;
}

/**
 * Extract context for code explanation from the current editor
 * 
 * @param editor - VS Code text editor instance
 * @param selection - Current text selection
 * @returns AI request context object
 */
function extractExplanationContext(editor: vscode.TextEditor, selection: vscode.Range): AIRequestContext {
    const document = editor.document;

    const selectedText = document.getText(selection);

    const contextLines = 15; // Good amount of context for explanations
    const startLine = Math.max(0, selection.start.line - contextLines);
    const endLine = Math.min(document.lineCount - 1, selection.end.line + contextLines);
    
    const surroundingCode = document.getText(new vscode.Range(
        new vscode.Position(startLine, 0),
        new vscode.Position(endLine, document.lineAt(endLine).text.length)
    ));

    const maxFileSize = 8000; // Reasonable context for explanations
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
 * Display the code explanation in a formatted way
 * 
 * @param explanation - AI-generated explanation
 * @param originalCode - Original code that was explained
 * @param language - Programming language
 * @param explanationLevel - Level of explanation requested
 * @param usage - Token usage information
 */
async function displayExplanation(
    explanation: string,
    originalCode: string,
    language: string,
    explanationLevel: typeof EXPLANATION_LEVELS[0],
    usage?: { totalTokens: number }
): Promise<void> {
    
    const formattedExplanation = formatExplanation(
        explanation,
        originalCode,
        language,
        explanationLevel,
        usage
    );

    const doc = await vscode.workspace.openTextDocument({
        content: formattedExplanation,
        language: 'markdown'
    });

    await vscode.window.showTextDocument(doc, {
        viewColumn: vscode.ViewColumn.Beside,
        preserveFocus: false
    });

    const action = await vscode.window.showInformationMessage(
        `${explanationLevel.icon} Code explanation generated successfully!`,
        'Ask Follow-up',
        'Save Explanation',
        'Explain More Code'
    );

    if (action === 'Ask Follow-up') {
        await askFollowUpQuestion(originalCode, language, explanation);
    } else if (action === 'Save Explanation') {
        await saveExplanation(formattedExplanation, language);
    } else if (action === 'Explain More Code') {
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        await explainCodeCommand(
            {} as AIProvider,
            {} as Logger
        );
    }
}

/**
 * Format the explanation into a readable markdown document
 * 
 * @param explanation - Raw AI explanation
 * @param originalCode - Original code
 * @param language - Programming language
 * @param explanationLevel - Explanation level
 * @param usage - Token usage info
 * @returns Formatted markdown string
 */
function formatExplanation(
    explanation: string,
    originalCode: string,
    language: string,
    explanationLevel: typeof EXPLANATION_LEVELS[0],
    usage?: { totalTokens: number }
): string {
    const timestamp = new Date().toLocaleString();
    const tokenInfo = usage ? ` (${usage.totalTokens} tokens used)` : '';

    return `# ${explanationLevel.icon} Code Explanation: ${explanationLevel.label}

*Generated on ${timestamp}${tokenInfo}*

## Original Code

\`\`\`${language}
${originalCode}
\`\`\`

## Explanation

${explanation}

---

*This explanation was generated by AI Copilot Extension. Please review and verify the accuracy of the information provided.*

### Actions Available:
- **Ask Follow-up**: Get more specific information about parts of the code
- **Save Explanation**: Save this explanation as a documentation file
- **Explain More Code**: Select and explain additional code sections

### Tips:
- Use this explanation as a starting point for understanding the code
- Consider adding inline comments based on this explanation
- Share this explanation with team members for code reviews
`;
}

/**
 * Handle follow-up questions about the explained code
 * 
 * @param originalCode - Original code that was explained
 * @param language - Programming language
 * @param previousExplanation - Previous explanation for context
 */
async function askFollowUpQuestion(
    _originalCode: string,
    _language: string,
    _previousExplanation: string
): Promise<void> {
    
    const question = await vscode.window.showInputBox({
        title: 'Ask a Follow-up Question',
        prompt: 'What specific aspect of the code would you like to understand better?',
        placeHolder: 'e.g., "Why is this algorithm used?" or "What does this variable represent?"',
        validateInput: (value: string) => {
            if (!value || value.trim().length === 0) {
                return 'Please enter a question about the code';
            }
            if (value.trim().length < 5) {
                return 'Please provide a more specific question';
            }
            return null;
        }
    });

    if (!question) {
        return;
    }

    vscode.window.showInformationMessage(
        'Follow-up questions feature will be implemented in the next version. ' +
        'For now, you can use the chat feature to ask specific questions about your code.'
    );
}

/**
 * Save the explanation as a documentation file
 * 
 * @param explanation - Formatted explanation content
 * @param language - Programming language
 */
async function saveExplanation(explanation: string, language: string): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const defaultName = `code-explanation-${language}-${timestamp}.md`;

    const saveUri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(defaultName),
        filters: {
            'Markdown': ['md'],
            'Text': ['txt'],
            'All Files': ['*']
        },
        saveLabel: 'Save Explanation'
    });

    if (saveUri) {
        try {
            await vscode.workspace.fs.writeFile(
                saveUri,
                Buffer.from(explanation, 'utf8')
            );
            
            vscode.window.showInformationMessage(
                `✅ Explanation saved to ${saveUri.fsPath}`,
                'Open File'
            ).then(action => {
                if (action === 'Open File') {
                    vscode.window.showTextDocument(saveUri);
                }
            });
            
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to save explanation: ${error}`);
        }
    }
}

/**
 * Analyze code structure for better explanations (reserved for future use)
 * 
 * @param code - Code to analyze
 * @param language - Programming language
 * @returns Structure analysis object
 */
// function analyzeCodeStructure(code: string, language: string): {
//     functions: string[];
//     classes: string[];
//     variables: string[];
//     imports: string[];
//     complexity: 'low' | 'medium' | 'high';
// } {
//     const lines = code.split('\n');
//     const functions: string[] = [];
//     const classes: string[] = [];
//     const variables: string[] = [];
//     const imports: string[] = [];

//     const patterns = {
//         function: /(?:function|def|func|fn)\s+(\w+)/gi,
//         class: /(?:class|interface|struct)\s+(\w+)/gi,
//         variable: /(?:var|let|const|int|string|bool)\s+(\w+)/gi,
//         import: /(?:import|require|include|using)\s+(.+)/gi
//     };

//     for (const line of lines) {
//         let match;
//         while ((match = patterns.function.exec(line)) !== null) {
//             functions.push(match[1]);
//         }

//         patterns.class.lastIndex = 0;
//         while ((match = patterns.class.exec(line)) !== null) {
//             classes.push(match[1]);
//         }

//         patterns.variable.lastIndex = 0;
//         while ((match = patterns.variable.exec(line)) !== null) {
//             variables.push(match[1]);
//         }

//         patterns.import.lastIndex = 0;
//         while ((match = patterns.import.exec(line)) !== null) {
//             imports.push(match[1].trim());
//         }
//     }

//     const totalElements = functions.length + classes.length + variables.length;
//     const lineCount = lines.filter(line => line.trim().length > 0).length;
    
//     let complexity: 'low' | 'medium' | 'high' = 'low';
//     if (lineCount > 50 || totalElements > 10) {
//         complexity = 'high';
//     } else if (lineCount > 20 || totalElements > 5) {
//         complexity = 'medium';
//     }

//     return {
//         functions,
//         classes,
//         variables,
//         imports,
//         complexity
//     };
// }

/**
 * Generate explanation prompts based on code structure
 * 
 * @param structure - Code structure analysis
 * @param explanationLevel - Requested explanation level
 * @returns Tailored explanation prompt
 */
// function generateExplanationPrompt(
//     structure: ReturnType<typeof analyzeCodeStructure>,
//     explanationLevel: typeof EXPLANATION_LEVELS[0]
// ): string {
//     let prompt = `Please provide a ${explanationLevel.id} explanation of this code. `;

//     switch (explanationLevel.id) {
//         case 'basic':
//             prompt += 'Focus on what the code does at a high level.';
//             break;
//         case 'detailed':
//             prompt += 'Provide a line-by-line breakdown of the logic and flow.';
//             break;
//         case 'beginner':
//             prompt += 'Explain in simple terms, defining programming concepts as needed.';
//             break;
//         case 'expert':
//             prompt += 'Include technical details, design patterns, and best practices analysis.';
//             break;
//     }

//     if (structure.functions.length > 0) {
//         prompt += ` Pay special attention to the functions: ${structure.functions.join(', ')}.`;
//     }

//     if (structure.classes.length > 0) {
//         prompt += ` Explain the classes and their relationships: ${structure.classes.join(', ')}.`;
//     }

//     if (structure.complexity === 'high') {
//         prompt += ' This appears to be complex code, so break it down into manageable sections.';
//     }

//     return prompt;
// }
