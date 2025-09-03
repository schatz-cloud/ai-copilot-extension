/**
 * Task Agent
 * 
 * This module implements an autonomous AI agent that can execute complex,
 * multi-step coding tasks with user oversight. It coordinates with the
 * Code Agent and other components to perform sophisticated operations.
 * 
 * Key features:
 * - Multi-step task planning and execution
 * - User approval workflow for autonomous actions
 * - Task progress tracking and monitoring
 * - Error handling and recovery mechanisms
 * - Integration with VS Code workspace operations
 * - Safety controls and permission management
 * 
 * @author SATISH KUMAR NADARAJAN (penintechwiz@gmail.com)
 * @version 1.0.0
 */

import * as vscode from 'vscode';
import { AIProvider } from '../providers/aiProvider';
import { CodeAgent } from './codeAgent';
import { Logger } from '../utils/logger';

/**
 * Task execution step interface
 */
export interface TaskStep {
    /** Step ID */
    id: string;
    
    /** Step title */
    title: string;
    
    /** Step description */
    description: string;
    
    /** Step type */
    type: 'analysis' | 'file_operation' | 'code_generation' | 'user_approval' | 'validation';
    
    /** Step status */
    status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
    
    /** Step parameters */
    parameters?: Record<string, any>;
    
    /** Step result */
    result?: any;
    
    /** Error message if step failed */
    error?: string;
    
    /** Whether this step requires user approval */
    requiresApproval?: boolean;
}

/**
 * Task execution context
 */
export interface TaskExecutionContext {
    /** Task ID */
    taskId: string;
    
    /** Workspace folder */
    workspaceFolder: vscode.WorkspaceFolder;
    
    /** Target files for the task */
    targetFiles?: string[];
    
    /** Task parameters */
    parameters: Record<string, any>;
    
    /** User preferences */
    userPreferences?: {
        autoApprove?: boolean;
        backupFiles?: boolean;
        validateChanges?: boolean;
    };
}

/**
 * Task result interface
 */
export interface TaskResult {
    /** Whether task completed successfully */
    success: boolean;
    
    /** Task result message */
    message: string;
    
    /** Files that were modified */
    modifiedFiles: string[];
    
    /** Files that were created */
    createdFiles: string[];
    
    /** Execution steps */
    steps: TaskStep[];
    
    /** Execution time in milliseconds */
    executionTime: number;
    
    /** Any errors that occurred */
    errors: string[];
}

/**
 * Task Agent Class
 * 
 * Implements autonomous task execution with user oversight.
 * Coordinates complex operations across multiple files and components.
 */
export class TaskAgent {
    private aiProvider: AIProvider;
    private logger: Logger;
    private currentTask: TaskExecutionContext | null = null;
    private executionSteps: TaskStep[] = [];

    /**
     * Initialize the task agent
     * 
     * @param aiProvider - AI provider for task planning and execution
     * @param codeAgent - Code agent for code analysis operations
     * @param logger - Logger instance for debugging
     */
    constructor(aiProvider: AIProvider, _codeAgent: CodeAgent, logger: Logger) {
        this.aiProvider = aiProvider;
        this.logger = logger;
        
        this.logger.info('🔧 Task Agent initialized');
    }

    /**
     * Execute a complex coding task
     * 
     * @param taskDescription - Natural language description of the task
     * @param context - Task execution context
     * @param progressCallback - Callback for progress updates
     * @returns Promise resolving to task result
     */
    async executeTask(
        taskDescription: string,
        context: TaskExecutionContext,
        progressCallback?: (step: TaskStep, progress: number) => void
    ): Promise<TaskResult> {
        
        try {
            this.logger.startTimer('task-execution');
            this.logger.info(`Starting task execution: ${taskDescription}`);

            this.currentTask = context;
            this.executionSteps = [];

            const planningStep = await this.createPlanningStep(taskDescription, context);
            await this.executeStep(planningStep, progressCallback);

            const approvalStep = await this.createApprovalStep(planningStep.result);
            const approved = await this.executeStep(approvalStep, progressCallback);

            if (!approved.result) {
                return this.createTaskResult(false, 'Task cancelled by user', []);
            }

            const executionSteps = planningStep.result.steps || [];
            
            for (let i = 0; i < executionSteps.length; i++) {
                const step = executionSteps[i];
                const progress = ((i + 1) / executionSteps.length) * 100;
                
                try {
                    await this.executeStep(step, progressCallback);
                    
                    if (progressCallback) {
                        progressCallback(step, progress);
                    }
                    
                } catch (error) {
                    this.logger.error(`Step ${step.id} failed:`, error);
                    step.status = 'failed';
                    step.error = error instanceof Error ? error.message : String(error);
                    
                    const shouldContinue = await this.handleStepFailure(step, error);
                    if (!shouldContinue) {
                        break;
                    }
                }
            }

            const validationStep = await this.createValidationStep();
            await this.executeStep(validationStep, progressCallback);

            const modifiedFiles = this.getModifiedFiles();
            const createdFiles = this.getCreatedFiles();
            const success = this.executionSteps.every(step => 
                step.status === 'completed' || step.status === 'skipped'
            );

            const result = this.createTaskResult(
                success,
                success ? 'Task completed successfully' : 'Task completed with errors',
                modifiedFiles.concat(createdFiles)
            );

            this.logger.stopTimer('task-execution');
            this.logger.info('✅ Task execution completed');

            return result;

        } catch (error) {
            this.logger.stopTimer('task-execution');
            this.logger.error('Task execution failed:', error);
            
            return this.createTaskResult(
                false,
                `Task failed: ${error instanceof Error ? error.message : String(error)}`,
                []
            );
        } finally {
            this.currentTask = null;
        }
    }

    /**
     * Create a task planning step
     * 
     * @param taskDescription - Task description
     * @param context - Execution context
     * @returns Planning step
     */
    private async createPlanningStep(
        taskDescription: string,
        context: TaskExecutionContext
    ): Promise<TaskStep> {
        
        return {
            id: 'planning',
            title: 'Task Planning',
            description: 'Analyzing task requirements and creating execution plan',
            type: 'analysis',
            status: 'pending',
            parameters: {
                taskDescription,
                workspaceFolder: context.workspaceFolder.uri.fsPath,
                targetFiles: context.targetFiles
            }
        };
    }

    /**
     * Create a user approval step
     * 
     * @param plan - Execution plan to approve
     * @returns Approval step
     */
    private async createApprovalStep(plan: any): Promise<TaskStep> {
        return {
            id: 'approval',
            title: 'User Approval',
            description: 'Requesting user approval for the execution plan',
            type: 'user_approval',
            status: 'pending',
            requiresApproval: true,
            parameters: { plan }
        };
    }

    /**
     * Create a validation step
     * 
     * @returns Validation step
     */
    private async createValidationStep(): Promise<TaskStep> {
        return {
            id: 'validation',
            title: 'Result Validation',
            description: 'Validating task execution results',
            type: 'validation',
            status: 'pending'
        };
    }

    /**
     * Execute a single task step
     * 
     * @param step - Step to execute
     * @param progressCallback - Progress callback
     * @returns Promise resolving to step result
     */
    private async executeStep(
        step: TaskStep,
        _progressCallback?: (step: TaskStep, progress: number) => void
    ): Promise<TaskStep> {
        
        this.logger.info(`Executing step: ${step.title}`);
        step.status = 'running';
        this.executionSteps.push(step);

        try {
            switch (step.type) {
                case 'analysis':
                    step.result = await this.executeAnalysisStep(step);
                    break;
                    
                case 'file_operation':
                    step.result = await this.executeFileOperationStep(step);
                    break;
                    
                case 'code_generation':
                    step.result = await this.executeCodeGenerationStep(step);
                    break;
                    
                case 'user_approval':
                    step.result = await this.executeUserApprovalStep(step);
                    break;
                    
                case 'validation':
                    step.result = await this.executeValidationStep(step);
                    break;
                    
                default:
                    throw new Error(`Unknown step type: ${step.type}`);
            }

            step.status = 'completed';
            this.logger.info(`✅ Step completed: ${step.title}`);

        } catch (error) {
            step.status = 'failed';
            step.error = error instanceof Error ? error.message : String(error);
            this.logger.error(`❌ Step failed: ${step.title}`, error);
            throw error;
        }

        return step;
    }

    /**
     * Execute an analysis step
     * 
     * @param step - Analysis step to execute
     * @returns Analysis result
     */
    private async executeAnalysisStep(step: TaskStep): Promise<any> {
        const { taskDescription, workspaceFolder, targetFiles } = step.parameters || {};

        const planningPrompt = `
Create a detailed execution plan for the following task:

Task: ${taskDescription}
Workspace: ${workspaceFolder}
Target Files: ${targetFiles ? targetFiles.join(', ') : 'All relevant files'}

Please provide:
1. A list of specific steps to complete this task
2. Files that will need to be modified or created
3. Any potential risks or considerations
4. Estimated complexity and time requirements

Format your response as a structured plan with clear steps.
`;

        const response = await this.aiProvider.generateChatCompletion([
            {
                role: 'system',
                content: 'You are an expert software development assistant. Create detailed, actionable execution plans for coding tasks.'
            },
            {
                role: 'user',
                content: planningPrompt
            }
        ]);

        const planSteps = this.parsePlanFromResponse(response.content);

        return {
            plan: response.content,
            steps: planSteps,
            estimatedComplexity: 'medium', // Would be determined from AI response
            estimatedTime: '15-30 minutes' // Would be determined from AI response
        };
    }

    /**
     * Execute a file operation step
     * 
     * @param step - File operation step to execute
     * @returns Operation result
     */
    private async executeFileOperationStep(step: TaskStep): Promise<any> {
        const { operation, filePath, content } = step.parameters || {};

        switch (operation) {
            case 'create':
                await this.createFile(filePath, content);
                return { created: filePath };
                
            case 'modify':
                await this.modifyFile(filePath, content);
                return { modified: filePath };
                
            case 'delete':
                await this.deleteFile(filePath);
                return { deleted: filePath };
                
            default:
                throw new Error(`Unknown file operation: ${operation}`);
        }
    }

    /**
     * Execute a code generation step
     * 
     * @param step - Code generation step to execute
     * @returns Generated code
     */
    private async executeCodeGenerationStep(step: TaskStep): Promise<any> {
        const { prompt, language, filePath } = step.parameters || {};

        const response = await this.aiProvider.generateCode(prompt, language);
        
        if (filePath) {
            await this.createFile(filePath, response.content);
        }

        return {
            generatedCode: response.content,
            filePath: filePath || null
        };
    }

    /**
     * Execute a user approval step
     * 
     * @param step - User approval step to execute
     * @returns User approval decision
     */
    private async executeUserApprovalStep(step: TaskStep): Promise<boolean> {
        const { plan } = step.parameters || {};

        const choice = await vscode.window.showWarningMessage(
            `🤖 Task Agent wants to execute the following plan:\n\n${plan}\n\nDo you approve this execution?`,
            { modal: true },
            'Approve',
            'Deny',
            'View Details'
        );

        if (choice === 'View Details') {
            const doc = await vscode.workspace.openTextDocument({
                content: plan,
                language: 'markdown'
            });
            await vscode.window.showTextDocument(doc);
            
            return this.executeUserApprovalStep(step);
        }

        return choice === 'Approve';
    }

    /**
     * Execute a validation step
     * 
     * @param step - Validation step to execute
     * @returns Validation result
     */
    private async executeValidationStep(_step: TaskStep): Promise<any> {
        const modifiedFiles = this.getModifiedFiles();
        const createdFiles = this.getCreatedFiles();
        
        const validationResults: Array<{
            file: string;
            valid: boolean;
            issues: string[];
        }> = [];
        
        for (const filePath of [...modifiedFiles, ...createdFiles]) {
            try {
                const uri = vscode.Uri.file(filePath);
                const document = await vscode.workspace.openTextDocument(uri);
                
                if (this.isCodeFile(filePath)) {
                    const hasBasicSyntax = this.validateBasicSyntax(document.getText(), document.languageId);
                    validationResults.push({
                        file: filePath,
                        valid: hasBasicSyntax,
                        issues: hasBasicSyntax ? [] : ['Potential syntax issues detected']
                    });
                } else {
                    validationResults.push({
                        file: filePath,
                        valid: true,
                        issues: []
                    });
                }
                
            } catch (error) {
                validationResults.push({
                    file: filePath,
                    valid: false,
                    issues: [`File validation failed: ${error}`]
                });
            }
        }

        return {
            validatedFiles: validationResults,
            overallValid: validationResults.every(result => result.valid)
        };
    }

    /**
     * Handle step failure
     * 
     * @param step - Failed step
     * @param error - Error that occurred
     * @returns Whether to continue execution
     */
    private async handleStepFailure(step: TaskStep, error: any): Promise<boolean> {
        const choice = await vscode.window.showErrorMessage(
            `Step "${step.title}" failed: ${error instanceof Error ? error.message : String(error)}\n\nWhat would you like to do?`,
            'Continue',
            'Retry',
            'Abort'
        );

        switch (choice) {
            case 'Continue':
                step.status = 'skipped';
                return true;
                
            case 'Retry':
                step.status = 'pending';
                try {
                    await this.executeStep(step);
                    return true;
                } catch (retryError) {
                    return this.handleStepFailure(step, retryError);
                }
                
            case 'Abort':
            default:
                return false;
        }
    }

    /**
     * Parse execution plan from AI response
     * 
     * @param response - AI response content
     * @returns Array of parsed steps
     */
    private parsePlanFromResponse(response: string): TaskStep[] {
        const steps: TaskStep[] = [];
        
        const stepMatches = response.match(/\d+\.\s+(.+)/g);
        
        if (stepMatches) {
            stepMatches.forEach((match, index) => {
                const stepText = match.replace(/^\d+\.\s+/, '').trim();
                
                steps.push({
                    id: `step_${index + 1}`,
                    title: stepText.substring(0, 50) + (stepText.length > 50 ? '...' : ''),
                    description: stepText,
                    type: this.inferStepType(stepText),
                    status: 'pending'
                });
            });
        }

        return steps;
    }

    /**
     * Infer step type from step description
     * 
     * @param stepText - Step description
     * @returns Inferred step type
     */
    private inferStepType(stepText: string): TaskStep['type'] {
        const lowerText = stepText.toLowerCase();
        
        if (lowerText.includes('analyze') || lowerText.includes('review')) {
            return 'analysis';
        }
        if (lowerText.includes('create') || lowerText.includes('modify') || lowerText.includes('delete')) {
            return 'file_operation';
        }
        if (lowerText.includes('generate') || lowerText.includes('write code')) {
            return 'code_generation';
        }
        if (lowerText.includes('validate') || lowerText.includes('test')) {
            return 'validation';
        }
        
        return 'analysis'; // Default
    }

    /**
     * Create a file
     * 
     * @param filePath - Path to create file at
     * @param content - File content
     */
    private async createFile(filePath: string, content: string): Promise<void> {
        const uri = vscode.Uri.file(filePath);
        await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
        this.logger.info(`Created file: ${filePath}`);
    }

    /**
     * Modify a file
     * 
     * @param filePath - Path to file to modify
     * @param content - New file content
     */
    private async modifyFile(filePath: string, content: string): Promise<void> {
        const uri = vscode.Uri.file(filePath);
        await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
        this.logger.info(`Modified file: ${filePath}`);
    }

    /**
     * Delete a file
     * 
     * @param filePath - Path to file to delete
     */
    private async deleteFile(filePath: string): Promise<void> {
        const uri = vscode.Uri.file(filePath);
        await vscode.workspace.fs.delete(uri);
        this.logger.info(`Deleted file: ${filePath}`);
    }

    /**
     * Check if a file is a code file
     * 
     * @param filePath - File path to check
     * @returns Whether file is a code file
     */
    private isCodeFile(filePath: string): boolean {
        const codeExtensions = ['.ts', '.js', '.tsx', '.jsx', '.py', '.java', '.cs', '.cpp', '.c', '.go', '.rs'];
        return codeExtensions.some(ext => filePath.endsWith(ext));
    }

    /**
     * Validate basic syntax of code
     * 
     * @param content - Code content
     * @param language - Programming language
     * @returns Whether syntax appears valid
     */
    private validateBasicSyntax(content: string, _language: string): boolean {
        
        const brackets = { '(': ')', '[': ']', '{': '}' };
        const stack: string[] = [];
        
        for (const char of content) {
            if (char in brackets) {
                stack.push(brackets[char as keyof typeof brackets]);
            } else if (Object.values(brackets).includes(char)) {
                if (stack.pop() !== char) {
                    return false;
                }
            }
        }
        
        return stack.length === 0;
    }

    /**
     * Get list of modified files
     * 
     * @returns Array of modified file paths
     */
    private getModifiedFiles(): string[] {
        return this.executionSteps
            .filter(step => step.type === 'file_operation' && step.result?.modified)
            .map(step => step.result.modified);
    }

    /**
     * Get list of created files
     * 
     * @returns Array of created file paths
     */
    private getCreatedFiles(): string[] {
        return this.executionSteps
            .filter(step => step.type === 'file_operation' && step.result?.created)
            .map(step => step.result.created);
    }

    /**
     * Create task result object
     * 
     * @param success - Whether task succeeded
     * @param message - Result message
     * @param affectedFiles - Files that were affected
     * @returns Task result
     */
    private createTaskResult(success: boolean, message: string, _affectedFiles: string[]): TaskResult {
        const modifiedFiles = this.getModifiedFiles();
        const createdFiles = this.getCreatedFiles();
        const errors = this.executionSteps
            .filter(step => step.error)
            .map(step => step.error!);

        return {
            success,
            message,
            modifiedFiles,
            createdFiles,
            steps: [...this.executionSteps],
            executionTime: 0, // Would be calculated from actual execution time
            errors
        };
    }

    /**
     * Get current task status
     * 
     * @returns Current task context or null
     */
    getCurrentTask(): TaskExecutionContext | null {
        return this.currentTask;
    }

    /**
     * Cancel current task execution
     */
    async cancelCurrentTask(): Promise<void> {
        if (this.currentTask) {
            this.logger.info('Cancelling current task execution');
            this.currentTask = null;
            
            for (const step of this.executionSteps) {
                if (step.status === 'running') {
                    step.status = 'failed';
                    step.error = 'Cancelled by user';
                }
            }
        }
    }

    /**
     * Dispose of resources
     */
    dispose(): void {
        this.currentTask = null;
        this.executionSteps = [];
        this.logger.info('Task Agent disposed');
    }
}
