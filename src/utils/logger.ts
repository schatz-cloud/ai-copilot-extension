/**
 * Logger Utility
 * 
 * This module provides a comprehensive logging system for the AI Copilot Extension.
 * It handles different log levels, output formatting, and integration with VS Code's
 * output channels for debugging and monitoring.
 * 
 * Key features:
 * - Multiple log levels (debug, info, warn, error)
 * - Structured logging with timestamps
 * - VS Code output channel integration
 * - Performance timing utilities
 * - Error tracking and reporting
 * 
 * @author SATISH KUMAR NADARAJAN (penintechwiz@gmail.com)
 * @version 1.0.0
 */

import * as vscode from 'vscode';

/**
 * Log levels enum for type safety and consistency
 */
export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3
}

/**
 * Log entry interface for structured logging
 */
export interface LogEntry {
    timestamp: Date;
    level: LogLevel;
    source: string;
    message: string;
    data?: any;
    error?: Error;
}

/**
 * Performance timer interface for measuring execution time
 */
export interface PerformanceTimer {
    name: string;
    startTime: number;
    endTime?: number;
    duration?: number;
}

/**
 * Logger Class
 * 
 * Provides comprehensive logging functionality with multiple output targets
 * and structured log formatting. Each component should create its own logger
 * instance with an appropriate source name.
 */
export class Logger {
    private static outputChannel: vscode.OutputChannel;
    private static globalLogLevel: LogLevel = LogLevel.INFO;
    private static logHistory: LogEntry[] = [];
    private static maxHistorySize: number = 1000;
    
    private source: string;
    private timers: Map<string, PerformanceTimer> = new Map();

    /**
     * Initialize a new logger instance
     * 
     * @param source - The source component name for this logger
     */
    constructor(source: string) {
        this.source = source;
        
        if (!Logger.outputChannel) {
            Logger.outputChannel = vscode.window.createOutputChannel('AI Copilot Extension');
        }
    }

    /**
     * Log a debug message
     * 
     * Debug messages are only shown when debug logging is enabled.
     * Use for detailed information that's only useful during development.
     * 
     * @param message - The debug message
     * @param data - Optional additional data to log
     */
    public debug(message: string, data?: any): void {
        this.log(LogLevel.DEBUG, message, data);
    }

    /**
     * Log an informational message
     * 
     * Info messages provide general information about extension operation.
     * Use for normal operational messages that might be useful to users.
     * 
     * @param message - The info message
     * @param data - Optional additional data to log
     */
    public info(message: string, data?: any): void {
        this.log(LogLevel.INFO, message, data);
    }

    /**
     * Log a warning message
     * 
     * Warning messages indicate potential issues that don't prevent operation.
     * Use for recoverable errors or configuration issues.
     * 
     * @param message - The warning message
     * @param data - Optional additional data to log
     */
    public warn(message: string, data?: any): void {
        this.log(LogLevel.WARN, message, data);
    }

    /**
     * Log an error message
     * 
     * Error messages indicate serious problems that may affect functionality.
     * Use for exceptions, API failures, and other critical issues.
     * 
     * @param message - The error message
     * @param error - Optional Error object with stack trace
     * @param data - Optional additional data to log
     */
    public error(message: string, error?: Error | any, data?: any): void {
        if (error && !(error instanceof Error) && typeof error === 'object' && !data) {
            data = error;
            error = undefined;
        }
        
        this.log(LogLevel.ERROR, message, data, error);
    }

    /**
     * Start a performance timer
     * 
     * Use this to measure the execution time of operations.
     * Call stopTimer() with the same name to complete the measurement.
     * 
     * @param name - Unique name for this timer
     */
    public startTimer(name: string): void {
        const timer: PerformanceTimer = {
            name,
            startTime: performance.now()
        };
        
        this.timers.set(name, timer);
        this.debug(`⏱️ Timer started: ${name}`);
    }

    /**
     * Stop a performance timer and log the duration
     * 
     * @param name - Name of the timer to stop
     * @returns The duration in milliseconds, or undefined if timer not found
     */
    public stopTimer(name: string): number | undefined {
        const timer = this.timers.get(name);
        
        if (!timer) {
            this.warn(`⏱️ Timer not found: ${name}`);
            return undefined;
        }
        
        timer.endTime = performance.now();
        timer.duration = timer.endTime - timer.startTime;
        
        this.info(`⏱️ Timer completed: ${name} took ${timer.duration.toFixed(2)}ms`);
        
        this.timers.delete(name);
        
        return timer.duration;
    }

    /**
     * Log an API call for debugging
     * 
     * Special logging method for tracking API interactions.
     * 
     * @param method - HTTP method (GET, POST, etc.)
     * @param url - API endpoint URL
     * @param status - Response status code
     * @param duration - Request duration in milliseconds
     * @param data - Optional request/response data
     */
    public logApiCall(method: string, url: string, status: number, duration: number, data?: any): void {
        const message = `🌐 API ${method} ${url} - ${status} (${duration.toFixed(2)}ms)`;
        
        if (status >= 200 && status < 300) {
            this.info(message, data);
        } else if (status >= 400) {
            this.error(message, data);
        } else {
            this.warn(message, data);
        }
    }

    /**
     * Log user action for analytics
     * 
     * Track user interactions with the extension for usage analytics.
     * 
     * @param action - The action performed
     * @param context - Additional context about the action
     */
    public logUserAction(action: string, context?: any): void {
        this.info(`👤 User action: ${action}`, context);
    }

    /**
     * Core logging method
     * 
     * This is the main logging implementation that handles formatting,
     * filtering, and output to various targets.
     * 
     * @param level - Log level
     * @param message - Log message
     * @param data - Optional additional data
     * @param error - Optional error object
     */
    private log(level: LogLevel, message: string, data?: any, error?: Error): void {
        if (level < Logger.globalLogLevel) {
            return;
        }
        
        const entry: LogEntry = {
            timestamp: new Date(),
            level,
            source: this.source,
            message,
            data,
            error
        };
        
        Logger.logHistory.push(entry);
        if (Logger.logHistory.length > Logger.maxHistorySize) {
            Logger.logHistory.shift();
        }
        
        const formattedMessage = this.formatLogEntry(entry);
        
        Logger.outputChannel.appendLine(formattedMessage);
        
        this.outputToConsole(level, formattedMessage, error);
        
        if (level === LogLevel.ERROR && this.shouldShowErrorToUser(message)) {
            this.showErrorToUser(message, error);
        }
    }

    /**
     * Format a log entry for display
     * 
     * @param entry - The log entry to format
     * @returns Formatted log message string
     */
    private formatLogEntry(entry: LogEntry): string {
        const timestamp = entry.timestamp.toISOString();
        const levelName = LogLevel[entry.level].padEnd(5);
        const source = entry.source.padEnd(20);
        
        let formatted = `[${timestamp}] ${levelName} [${source}] ${entry.message}`;
        
        if (entry.data) {
            formatted += `\n  Data: ${JSON.stringify(entry.data, null, 2)}`;
        }
        
        if (entry.error) {
            formatted += `\n  Error: ${entry.error.message}`;
            if (entry.error.stack) {
                formatted += `\n  Stack: ${entry.error.stack}`;
            }
        }
        
        return formatted;
    }

    /**
     * Output log message to browser console
     * 
     * @param level - Log level
     * @param message - Formatted message
     * @param error - Optional error object
     */
    private outputToConsole(level: LogLevel, message: string, error?: Error): void {
        switch (level) {
            case LogLevel.DEBUG:
                console.debug(message);
                break;
            case LogLevel.INFO:
                console.info(message);
                break;
            case LogLevel.WARN:
                console.warn(message);
                break;
            case LogLevel.ERROR:
                if (error) {
                    console.error(message, error);
                } else {
                    console.error(message);
                }
                break;
        }
    }

    /**
     * Determine if an error should be shown to the user
     * 
     * @param message - Error message
     * @returns True if the error should be displayed to the user
     */
    private shouldShowErrorToUser(message: string): boolean {
        const internalErrors = [
            'Timer not found',
            'Configuration validation',
            'Debug:',
            'Internal:'
        ];
        
        return !internalErrors.some(pattern => message.includes(pattern));
    }

    /**
     * Show error message to user via VS Code UI
     * 
     * @param message - Error message
     * @param error - Optional error object
     */
    private async showErrorToUser(message: string, _error?: Error): Promise<void> {
        const action = await vscode.window.showErrorMessage(
            `AI Copilot: ${message}`,
            'View Logs',
            'Dismiss'
        );
        
        if (action === 'View Logs') {
            this.show();
        }
    }

    /**
     * Show the output channel
     * 
     * Brings the extension's output channel into focus so users can see logs.
     */
    public show(): void {
        Logger.outputChannel.show();
    }

    /**
     * Clear all logs
     * 
     * Clears both the output channel and the log history.
     */
    public static clear(): void {
        if (Logger.outputChannel) {
            Logger.outputChannel.clear();
        }
        Logger.logHistory = [];
    }

    /**
     * Set the global log level
     * 
     * @param level - New log level threshold
     */
    public static setLogLevel(level: LogLevel): void {
        Logger.globalLogLevel = level;
    }

    /**
     * Get the current log level
     * 
     * @returns Current global log level
     */
    public static getLogLevel(): LogLevel {
        return Logger.globalLogLevel;
    }

    /**
     * Get log history
     * 
     * @param maxEntries - Maximum number of entries to return
     * @returns Array of recent log entries
     */
    public static getLogHistory(maxEntries?: number): LogEntry[] {
        if (maxEntries) {
            return Logger.logHistory.slice(-maxEntries);
        }
        return [...Logger.logHistory];
    }

    /**
     * Export logs to a string
     * 
     * @param maxEntries - Maximum number of entries to export
     * @returns Formatted log string suitable for saving or sharing
     */
    public static exportLogs(maxEntries?: number): string {
        const entries = Logger.getLogHistory(maxEntries);
        return entries.map(entry => {
            const timestamp = entry.timestamp.toISOString();
            const level = LogLevel[entry.level];
            let line = `[${timestamp}] ${level} [${entry.source}] ${entry.message}`;
            
            if (entry.data) {
                line += ` | Data: ${JSON.stringify(entry.data)}`;
            }
            
            if (entry.error) {
                line += ` | Error: ${entry.error.message}`;
            }
            
            return line;
        }).join('\n');
    }

    /**
     * Dispose of logger resources
     * 
     * Clean up the output channel and other resources when the extension deactivates.
     */
    public static dispose(): void {
        if (Logger.outputChannel) {
            Logger.outputChannel.dispose();
        }
        Logger.logHistory = [];
    }
}
