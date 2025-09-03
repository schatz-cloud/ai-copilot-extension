/**
 * Agent Panel View
 * 
 * This module implements the agentic capabilities interface for the AI Copilot Extension.
 * It provides a panel where users can monitor and control autonomous AI agents that
 * can perform complex coding tasks with user oversight.
 * 
 * Key features:
 * - Task queue management and monitoring
 * - Agent status and progress tracking
 * - User approval workflow for autonomous actions
 * - Safety controls and permission management
 * - Task history and audit trail
 * 
 * @author SATISH KUMAR NADARAJAN (penintechwiz@gmail.com)
 * @version 1.0.0
 */

import * as vscode from 'vscode';
import { TaskAgent } from '../agents/taskAgent';
import { Logger } from '../utils/logger';

/**
 * Agent task status enumeration
 */
export enum TaskStatus {
    PENDING = 'pending',
    RUNNING = 'running',
    WAITING_APPROVAL = 'waiting_approval',
    COMPLETED = 'completed',
    FAILED = 'failed',
    CANCELLED = 'cancelled'
}

/**
 * Agent task interface
 */
export interface AgentTask {
    /** Unique task ID */
    id: string;
    
    /** Task title/description */
    title: string;
    
    /** Detailed task description */
    description: string;
    
    /** Current task status */
    status: TaskStatus;
    
    /** Task creation timestamp */
    createdAt: Date;
    
    /** Task completion timestamp */
    completedAt?: Date;
    
    /** Progress percentage (0-100) */
    progress: number;
    
    /** Current step being executed */
    currentStep?: string;
    
    /** Total number of steps */
    totalSteps?: number;
    
    /** Task result or error message */
    result?: string;
    
    /** Files that will be modified */
    affectedFiles?: string[];
    
    /** Required user permissions */
    requiredPermissions?: string[];
}

/**
 * Agent Panel Class
 * 
 * Implements the agentic capabilities interface as a VS Code TreeDataProvider.
 * Manages agent tasks, user approvals, and safety controls.
 */
export class AgentPanel implements vscode.TreeDataProvider<AgentTask> {
    private _onDidChangeTreeData: vscode.EventEmitter<AgentTask | undefined | null | void> = new vscode.EventEmitter<AgentTask | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<AgentTask | undefined | null | void> = this._onDidChangeTreeData.event;

    private context: vscode.ExtensionContext;
    // private taskAgent: TaskAgent; // Used for agent task management (reserved for future use)
    private logger: Logger;
    private tasks: AgentTask[] = [];
    private isAgenticModeEnabled: boolean = false;

    /**
     * Initialize the agent panel
     * 
     * @param context - VS Code extension context
     * @param taskAgent - Task agent for executing autonomous tasks
     * @param logger - Logger instance for debugging
     */
    constructor(context: vscode.ExtensionContext, _taskAgent: TaskAgent, logger: Logger) {
        this.context = context;
        this.logger = logger;
        
        this.loadTaskHistory();
        
        this.updateAgenticModeState();
        
        vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration('aiCopilot.enableAgenticMode')) {
                this.updateAgenticModeState();
            }
        });
        
        this.logger.info('🔧 Agent Panel initialized');
    }

    /**
     * Get tree item representation for VS Code tree view
     * 
     * @param element - Agent task element
     * @returns Tree item representation
     */
    getTreeItem(element: AgentTask): vscode.TreeItem {
        const item = new vscode.TreeItem(
            element.title,
            vscode.TreeItemCollapsibleState.None
        );

        item.iconPath = this.getStatusIcon(element.status);
        
        if (element.status === TaskStatus.RUNNING && element.progress > 0) {
            item.description = `${element.progress}% - ${element.currentStep || 'Processing...'}`;
        } else {
            item.description = this.getStatusDescription(element.status);
        }
        
        item.tooltip = this.getTaskTooltip(element);
        
        item.contextValue = `agentTask.${element.status}`;
        
        item.command = {
            command: 'aiCopilot.showTaskDetails',
            title: 'Show Task Details',
            arguments: [element]
        };

        return item;
    }

    /**
     * Get children for tree view (returns all tasks)
     * 
     * @param element - Parent element (unused for flat list)
     * @returns Array of agent tasks
     */
    getChildren(element?: AgentTask): Thenable<AgentTask[]> {
        if (!element) {
            if (!this.isAgenticModeEnabled) {
                return Promise.resolve([]);
            }
            
            const sortedTasks = [...this.tasks].sort((a, b) => 
                b.createdAt.getTime() - a.createdAt.getTime()
            );
            
            return Promise.resolve(sortedTasks);
        }
        return Promise.resolve([]);
    }

    /**
     * Create a new agent task
     * 
     * @param title - Task title
     * @param description - Task description
     * @param requiredPermissions - Required user permissions
     * @returns Created task
     */
    async createTask(
        title: string, 
        description: string, 
        requiredPermissions: string[] = []
    ): Promise<AgentTask> {
        
        const task: AgentTask = {
            id: this.generateTaskId(),
            title,
            description,
            status: TaskStatus.PENDING,
            createdAt: new Date(),
            progress: 0,
            requiredPermissions
        };

        this.tasks.push(task);
        this._onDidChangeTreeData.fire();
        this.saveTaskHistory();

        this.logger.logUserAction('agent-task-created', { 
            taskId: task.id, 
            title, 
            permissions: requiredPermissions 
        });

        return task;
    }

    /**
     * Update task status and progress
     * 
     * @param taskId - Task ID to update
     * @param updates - Task updates
     */
    async updateTask(taskId: string, updates: Partial<AgentTask>): Promise<void> {
        const task = this.tasks.find(t => t.id === taskId);
        if (!task) {
            this.logger.warn(`Task not found: ${taskId}`);
            return;
        }

        Object.assign(task, updates);
        
        if (updates.status === TaskStatus.COMPLETED || updates.status === TaskStatus.FAILED) {
            task.completedAt = new Date();
        }

        this._onDidChangeTreeData.fire();
        this.saveTaskHistory();

        this.logger.debug(`Task updated: ${taskId}`, updates);
    }

    /**
     * Request user approval for a task action
     * 
     * @param taskId - Task ID requiring approval
     * @param action - Action description
     * @param details - Additional details about the action
     * @returns Promise resolving to user approval decision
     */
    async requestUserApproval(
        taskId: string, 
        action: string, 
        details: string
    ): Promise<boolean> {
        
        const task = this.tasks.find(t => t.id === taskId);
        if (!task) {
            return false;
        }

        await this.updateTask(taskId, { 
            status: TaskStatus.WAITING_APPROVAL,
            currentStep: `Waiting for approval: ${action}`
        });

        const choice = await vscode.window.showWarningMessage(
            `🤖 Agent Task: ${task.title}\n\nThe AI agent wants to perform the following action:\n\n${action}\n\nDetails: ${details}\n\nDo you approve this action?`,
            { modal: true },
            'Approve',
            'Deny',
            'View Details'
        );

        if (choice === 'View Details') {
            await this.showTaskDetails(task);
            return this.requestUserApproval(taskId, action, details);
        }

        const approved = choice === 'Approve';
        
        this.logger.logUserAction('agent-approval-request', { 
            taskId, 
            action, 
            approved 
        });

        if (approved) {
            await this.updateTask(taskId, { 
                status: TaskStatus.RUNNING,
                currentStep: action
            });
        } else {
            await this.updateTask(taskId, { 
                status: TaskStatus.CANCELLED,
                result: 'Cancelled by user'
            });
        }

        return approved;
    }

    /**
     * Show detailed information about a task
     * 
     * @param task - Task to show details for
     */
    async showTaskDetails(task: AgentTask): Promise<void> {
        const content = this.generateTaskDetailsContent(task);
        
        const doc = await vscode.workspace.openTextDocument({
            content,
            language: 'markdown'
        });

        await vscode.window.showTextDocument(doc, {
            viewColumn: vscode.ViewColumn.Beside,
            preserveFocus: false
        });

        this.logger.logUserAction('agent-task-details-viewed', { taskId: task.id });
    }

    /**
     * Cancel a running task
     * 
     * @param taskId - Task ID to cancel
     */
    async cancelTask(taskId: string): Promise<void> {
        const task = this.tasks.find(t => t.id === taskId);
        if (!task) {
            return;
        }

        if (task.status === TaskStatus.RUNNING || task.status === TaskStatus.WAITING_APPROVAL) {
            await this.updateTask(taskId, {
                status: TaskStatus.CANCELLED,
                result: 'Cancelled by user'
            });

            vscode.window.showInformationMessage(`Task "${task.title}" has been cancelled.`);
            
            this.logger.logUserAction('agent-task-cancelled', { taskId });
        }
    }

    /**
     * Clear completed tasks from the history
     */
    async clearCompletedTasks(): Promise<void> {
        const completedCount = this.tasks.filter(t => 
            t.status === TaskStatus.COMPLETED || 
            t.status === TaskStatus.FAILED || 
            t.status === TaskStatus.CANCELLED
        ).length;

        if (completedCount === 0) {
            vscode.window.showInformationMessage('No completed tasks to clear.');
            return;
        }

        const choice = await vscode.window.showWarningMessage(
            `Clear ${completedCount} completed task(s) from history?`,
            'Clear',
            'Cancel'
        );

        if (choice === 'Clear') {
            this.tasks = this.tasks.filter(t => 
                t.status !== TaskStatus.COMPLETED && 
                t.status !== TaskStatus.FAILED && 
                t.status !== TaskStatus.CANCELLED
            );

            this._onDidChangeTreeData.fire();
            this.saveTaskHistory();

            vscode.window.showInformationMessage(`Cleared ${completedCount} completed task(s).`);
            
            this.logger.logUserAction('agent-tasks-cleared', { count: completedCount });
        }
    }

    /**
     * Get status icon for a task
     * 
     * @param status - Task status
     * @returns VS Code theme icon
     */
    private getStatusIcon(status: TaskStatus): vscode.ThemeIcon {
        switch (status) {
            case TaskStatus.PENDING:
                return new vscode.ThemeIcon('clock');
            case TaskStatus.RUNNING:
                return new vscode.ThemeIcon('loading~spin');
            case TaskStatus.WAITING_APPROVAL:
                return new vscode.ThemeIcon('warning');
            case TaskStatus.COMPLETED:
                return new vscode.ThemeIcon('check');
            case TaskStatus.FAILED:
                return new vscode.ThemeIcon('error');
            case TaskStatus.CANCELLED:
                return new vscode.ThemeIcon('circle-slash');
            default:
                return new vscode.ThemeIcon('question');
        }
    }

    /**
     * Get status description for a task
     * 
     * @param status - Task status
     * @returns Human-readable status description
     */
    private getStatusDescription(status: TaskStatus): string {
        switch (status) {
            case TaskStatus.PENDING:
                return 'Pending';
            case TaskStatus.RUNNING:
                return 'Running';
            case TaskStatus.WAITING_APPROVAL:
                return 'Waiting for approval';
            case TaskStatus.COMPLETED:
                return 'Completed';
            case TaskStatus.FAILED:
                return 'Failed';
            case TaskStatus.CANCELLED:
                return 'Cancelled';
            default:
                return 'Unknown';
        }
    }

    /**
     * Get detailed tooltip for a task
     * 
     * @param task - Agent task
     * @returns Tooltip content
     */
    private getTaskTooltip(task: AgentTask): string {
        let tooltip = `${task.title}\n\n${task.description}\n\n`;
        tooltip += `Status: ${this.getStatusDescription(task.status)}\n`;
        tooltip += `Created: ${task.createdAt.toLocaleString()}\n`;
        
        if (task.completedAt) {
            tooltip += `Completed: ${task.completedAt.toLocaleString()}\n`;
        }
        
        if (task.progress > 0) {
            tooltip += `Progress: ${task.progress}%\n`;
        }
        
        if (task.currentStep) {
            tooltip += `Current Step: ${task.currentStep}\n`;
        }
        
        if (task.affectedFiles && task.affectedFiles.length > 0) {
            tooltip += `\nAffected Files:\n${task.affectedFiles.map(f => `• ${f}`).join('\n')}`;
        }

        return tooltip;
    }

    /**
     * Generate detailed content for task details view
     * 
     * @param task - Agent task
     * @returns Markdown content for task details
     */
    private generateTaskDetailsContent(task: AgentTask): string {
        const statusEmoji = {
            [TaskStatus.PENDING]: '⏳',
            [TaskStatus.RUNNING]: '🔄',
            [TaskStatus.WAITING_APPROVAL]: '⚠️',
            [TaskStatus.COMPLETED]: '✅',
            [TaskStatus.FAILED]: '❌',
            [TaskStatus.CANCELLED]: '🚫'
        };

        let content = `# ${statusEmoji[task.status]} Agent Task Details

## ${task.title}

**Status:** ${this.getStatusDescription(task.status)}  
**Created:** ${task.createdAt.toLocaleString()}  
`;

        if (task.completedAt) {
            content += `**Completed:** ${task.completedAt.toLocaleString()}  \n`;
        }

        if (task.progress > 0) {
            content += `**Progress:** ${task.progress}%  \n`;
        }

        if (task.currentStep) {
            content += `**Current Step:** ${task.currentStep}  \n`;
        }

        if (task.totalSteps) {
            content += `**Total Steps:** ${task.totalSteps}  \n`;
        }

        content += `\n## Description

${task.description}

`;

        if (task.requiredPermissions && task.requiredPermissions.length > 0) {
            content += `## Required Permissions

${task.requiredPermissions.map(p => `- ${p}`).join('\n')}

`;
        }

        if (task.affectedFiles && task.affectedFiles.length > 0) {
            content += `## Affected Files

${task.affectedFiles.map(f => `- \`${f}\``).join('\n')}

`;
        }

        if (task.result) {
            content += `## Result

${task.result}

`;
        }

        content += `---

*Task ID: ${task.id}*  
*Generated by AI Copilot Extension*
`;

        return content;
    }

    /**
     * Update agentic mode state from configuration
     */
    private updateAgenticModeState(): void {
        const config = vscode.workspace.getConfiguration('aiCopilot');
        this.isAgenticModeEnabled = config.get('enableAgenticMode', false);
        
        this._onDidChangeTreeData.fire();
        
        this.logger.debug(`Agentic mode ${this.isAgenticModeEnabled ? 'enabled' : 'disabled'}`);
    }

    /**
     * Generate unique task ID
     * 
     * @returns Unique task ID
     */
    private generateTaskId(): string {
        return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Load task history from storage
     */
    private loadTaskHistory(): void {
        try {
            const stored = this.context.globalState.get<AgentTask[]>('agentTaskHistory');
            
            if (stored) {
                this.tasks = stored.map(task => ({
                    ...task,
                    createdAt: new Date(task.createdAt),
                    completedAt: task.completedAt ? new Date(task.completedAt) : undefined
                }));
            }

            this.logger.debug(`Loaded ${this.tasks.length} tasks from storage`);

        } catch (error) {
            this.logger.error('Failed to load task history:', error);
        }
    }

    /**
     * Save task history to storage
     */
    private saveTaskHistory(): void {
        try {
            this.context.globalState.update('agentTaskHistory', this.tasks);
            this.logger.debug(`Saved ${this.tasks.length} tasks to storage`);

        } catch (error) {
            this.logger.error('Failed to save task history:', error);
        }
    }

    /**
     * Dispose of resources
     */
    dispose(): void {
        this._onDidChangeTreeData.dispose();
        this.logger.info('Agent Panel disposed');
    }
}
