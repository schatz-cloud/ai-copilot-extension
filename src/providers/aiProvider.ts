/**
 * AI Provider Interface
 * 
 * This module defines the abstract interface for AI providers in the extension.
 * It provides a standardized way to interact with different AI services
 * (OpenAI, Claude, local models) through a common interface.
 * 
 * Key responsibilities:
 * - Define common AI provider interface
 * - Standardize request/response formats
 * - Handle provider-specific configuration
 * - Provide error handling patterns
 * 
 * @author SATISH KUMAR NADARAJAN (penintechwiz@gmail.com)
 * @version 1.0.0
 */

/**
 * AI model configuration options
 * These options control how the AI model behaves
 */
export interface AIModelConfig {
    /** Maximum number of tokens in the response */
    maxTokens: number;
    
    /** Temperature controls randomness (0.0 = deterministic, 1.0 = creative) */
    temperature: number;
    
    /** Top-p sampling parameter for nucleus sampling */
    topP?: number;
    
    /** Frequency penalty to reduce repetition */
    frequencyPenalty?: number;
    
    /** Presence penalty to encourage topic diversity */
    presencePenalty?: number;
    
    /** Stop sequences to end generation */
    stopSequences?: string[];
}

/**
 * AI request context for providing relevant information
 */
export interface AIRequestContext {
    /** Current file content */
    currentFile?: string;
    
    /** Selected text in the editor */
    selectedText?: string;
    
    /** Programming language of the current file */
    language?: string;
    
    /** Cursor position in the file */
    cursorPosition?: number;
    
    /** Surrounding code context */
    surroundingCode?: string;
    
    /** Project/workspace context */
    projectContext?: string;
    
    /** Previous conversation history */
    conversationHistory?: AIMessage[];
    
    /** Manual file attachments */
    attachedFiles?: Array<{
        name: string;
        path: string;
        content: string;
        type: 'text' | 'image' | 'other';
        size: number;
    }>;
    
    /** Screenshot attachments */
    attachedScreenshots?: Array<{
        name: string;
        dataUrl: string;
        timestamp: Date;
    }>;
}

/**
 * AI message structure for conversations
 */
export interface AIMessage {
    /** Role of the message sender */
    role: 'system' | 'user' | 'assistant';
    
    /** Content of the message */
    content: string;
    
    /** Timestamp of the message */
    timestamp?: Date;
    
    /** Optional metadata */
    metadata?: Record<string, any>;
}

/**
 * AI response from the provider
 */
export interface AIResponse {
    /** Generated content */
    content: string;
    
    /** Model used for generation */
    model: string;
    
    /** Token usage information */
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
    
    /** Response metadata */
    metadata?: Record<string, any>;
    
    /** Finish reason */
    finishReason?: 'stop' | 'length' | 'content_filter' | 'function_call';
}

/**
 * Code completion specific request
 */
export interface CodeCompletionRequest {
    /** Code before the cursor */
    prefix: string;
    
    /** Code after the cursor */
    suffix: string;
    
    /** Programming language */
    language: string;
    
    /** File path for context */
    filePath?: string;
    
    /** Maximum completion length */
    maxLength?: number;
    
    /** Related files context for multi-file awareness */
    relatedFiles?: Array<{
        path: string;
        content: string;
        language: string;
        relevanceScore: number;
    }>;
    
    /** Import statements and dependencies */
    imports?: string[];
    
    /** Project context information */
    projectContext?: string;
}

/**
 * Code completion response
 */
export interface CodeCompletionResponse {
    /** Suggested completions */
    completions: Array<{
        /** Completion text */
        text: string;
        
        /** Confidence score (0-1) */
        confidence: number;
        
        /** Completion type (e.g., 'function', 'variable', 'keyword') */
        type?: string;
        
        /** Additional documentation */
        documentation?: string;
    }>;
    
    /** Model used */
    model: string;
    
    /** Processing time in milliseconds */
    processingTime: number;
}

/**
 * AI Provider Error types
 */
export class AIProviderError extends Error {
    constructor(
        message: string,
        public code: string,
        public statusCode?: number,
        public originalError?: Error
    ) {
        super(message);
        this.name = 'AIProviderError';
    }
}

/**
 * Abstract AI Provider Class
 * 
 * This abstract class defines the interface that all AI providers must implement.
 * It ensures consistency across different AI services and provides common
 * functionality for error handling and request processing.
 */
export abstract class AIProvider {
    protected config: AIModelConfig;
    protected modelName: string;

    /**
     * Initialize the AI provider
     * 
     * @param modelName - Name of the AI model to use
     * @param config - Configuration options for the model
     */
    constructor(modelName: string, config: AIModelConfig) {
        this.modelName = modelName;
        this.config = config;
    }

    /**
     * Generate a chat completion
     * 
     * This method handles conversational AI interactions, such as
     * answering questions, explaining code, or providing assistance.
     * 
     * @param messages - Array of conversation messages
     * @param context - Additional context for the request
     * @returns Promise resolving to AI response
     */
    abstract generateChatCompletion(
        messages: AIMessage[],
        context?: AIRequestContext
    ): Promise<AIResponse>;

    /**
     * Generate code completion suggestions
     * 
     * This method provides intelligent code completion based on the
     * current code context and cursor position.
     * 
     * @param request - Code completion request details
     * @returns Promise resolving to completion suggestions
     */
    abstract generateCodeCompletion(
        request: CodeCompletionRequest
    ): Promise<CodeCompletionResponse>;

    /**
     * Generate code from natural language description
     * 
     * This method converts natural language prompts into code
     * in the specified programming language.
     * 
     * @param prompt - Natural language description of desired code
     * @param language - Target programming language
     * @param context - Additional context for code generation
     * @returns Promise resolving to generated code
     */
    abstract generateCode(
        prompt: string,
        language: string,
        context?: AIRequestContext
    ): Promise<AIResponse>;

    /**
     * Explain code functionality
     * 
     * This method analyzes code and provides human-readable explanations
     * of what the code does, how it works, and any potential issues.
     * 
     * @param code - Code to explain
     * @param language - Programming language of the code
     * @param context - Additional context for explanation
     * @returns Promise resolving to code explanation
     */
    abstract explainCode(
        code: string,
        language: string,
        context?: AIRequestContext
    ): Promise<AIResponse>;

    /**
     * Refactor code with AI suggestions
     * 
     * This method analyzes code and suggests improvements for
     * readability, performance, or best practices.
     * 
     * @param code - Code to refactor
     * @param language - Programming language of the code
     * @param refactorType - Type of refactoring (e.g., 'optimize', 'clean', 'modernize')
     * @param context - Additional context for refactoring
     * @returns Promise resolving to refactored code
     */
    abstract refactorCode(
        code: string,
        language: string,
        refactorType: string,
        context?: AIRequestContext
    ): Promise<AIResponse>;

    /**
     * Analyze codebase for insights
     * 
     * This method performs high-level analysis of code to identify
     * patterns, potential issues, or improvement opportunities.
     * 
     * @param codeFiles - Array of code files to analyze
     * @param analysisType - Type of analysis to perform
     * @returns Promise resolving to analysis results
     */
    abstract analyzeCodebase(
        codeFiles: Array<{ path: string; content: string; language: string }>,
        analysisType: string
    ): Promise<AIResponse>;

    /**
     * Check if the provider is properly configured
     * 
     * This method validates that the provider has all necessary
     * configuration (API keys, endpoints, etc.) to function.
     * 
     * @returns Promise resolving to true if configured, false otherwise
     */
    abstract isConfigured(): Promise<boolean>;

    /**
     * Test the provider connection
     * 
     * This method performs a simple test to verify that the provider
     * can successfully communicate with the AI service.
     * 
     * @returns Promise resolving to true if connection works, false otherwise
     */
    abstract testConnection(): Promise<boolean>;

    /**
     * Get provider information
     * 
     * Returns information about the current provider configuration,
     * including model name, capabilities, and status.
     * 
     * @returns Provider information object
     */
    getProviderInfo(): {
        name: string;
        model: string;
        config: AIModelConfig;
        capabilities: string[];
    } {
        return {
            name: this.constructor.name,
            model: this.modelName,
            config: this.config,
            capabilities: [
                'chat',
                'code-completion',
                'code-generation',
                'code-explanation',
                'code-refactoring',
                'codebase-analysis'
            ]
        };
    }

    /**
     * Update provider configuration
     * 
     * Allows runtime updates to the provider configuration
     * without recreating the provider instance.
     * 
     * @param newConfig - New configuration options
     */
    updateConfig(newConfig: Partial<AIModelConfig>): void {
        this.config = { ...this.config, ...newConfig };
    }

    /**
     * Get current configuration
     * 
     * @returns Current provider configuration
     */
    getConfig(): AIModelConfig {
        return { ...this.config };
    }

    /**
     * Validate request parameters
     * 
     * Common validation logic for request parameters
     * that can be used by concrete implementations.
     * 
     * @param params - Parameters to validate
     * @throws AIProviderError if validation fails
     */
    protected validateRequest(params: any): void {
        if (!params) {
            throw new AIProviderError('Request parameters are required', 'INVALID_PARAMS');
        }

        if (this.config.maxTokens <= 0 || this.config.maxTokens > 32000) {
            throw new AIProviderError(
                'Invalid maxTokens value. Must be between 1 and 32000',
                'INVALID_CONFIG'
            );
        }

        if (this.config.temperature < 0 || this.config.temperature > 2) {
            throw new AIProviderError(
                'Invalid temperature value. Must be between 0 and 2',
                'INVALID_CONFIG'
            );
        }
    }

    /**
     * Handle provider errors
     * 
     * Common error handling logic that can be used by
     * concrete implementations to standardize error responses.
     * 
     * @param error - Original error
     * @param context - Additional context about the error
     * @throws AIProviderError with standardized format
     */
    protected handleError(error: any, context: string): never {
        if (error instanceof AIProviderError) {
            throw error;
        }

        if (error.response) {
            const status = error.response.status;
            const message = error.response.data?.error?.message || error.message;

            switch (status) {
                case 401:
                    throw new AIProviderError(
                        'Invalid API key or authentication failed',
                        'AUTH_ERROR',
                        status,
                        error
                    );
                case 429:
                    throw new AIProviderError(
                        'Rate limit exceeded. Please try again later',
                        'RATE_LIMIT',
                        status,
                        error
                    );
                case 500:
                    throw new AIProviderError(
                        'AI service is temporarily unavailable',
                        'SERVICE_ERROR',
                        status,
                        error
                    );
                default:
                    throw new AIProviderError(
                        `AI service error: ${message}`,
                        'API_ERROR',
                        status,
                        error
                    );
            }
        }

        if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
            throw new AIProviderError(
                'Unable to connect to AI service. Please check your internet connection',
                'NETWORK_ERROR',
                undefined,
                error
            );
        }

        throw new AIProviderError(
            `${context}: ${error.message}`,
            'UNKNOWN_ERROR',
            undefined,
            error
        );
    }

    /**
     * Format messages for API consumption
     * 
     * Helper method to format conversation messages in the format
     * expected by the AI service API.
     * 
     * @param messages - Array of AI messages
     * @returns Formatted messages for API
     */
    protected formatMessages(messages: AIMessage[]): any[] {
        return messages.map(msg => ({
            role: msg.role,
            content: msg.content
        }));
    }

    /**
     * Add system context to messages
     * 
     * Helper method to add system context and instructions
     * to the beginning of a conversation.
     * 
     * @param messages - Existing messages
     * @param context - Request context
     * @param systemPrompt - Additional system instructions
     * @returns Messages with system context added
     */
    protected addSystemContext(
        messages: AIMessage[],
        context?: AIRequestContext,
        systemPrompt?: string
    ): AIMessage[] {
        const systemMessages: AIMessage[] = [];

        if (systemPrompt) {
            systemMessages.push({
                role: 'system',
                content: systemPrompt
            });
        }

        if (context) {
            let contextPrompt = 'Context information:\n';

            if (context.language) {
                contextPrompt += `- Programming language: ${context.language}\n`;
            }

            if (context.currentFile) {
                contextPrompt += `- Current file content:\n\`\`\`${context.language || ''}\n${context.currentFile}\n\`\`\`\n`;
            }

            if (context.selectedText) {
                contextPrompt += `- Selected text:\n\`\`\`${context.language || ''}\n${context.selectedText}\n\`\`\`\n`;
            }

            if (context.projectContext) {
                contextPrompt += `- Project context: ${context.projectContext}\n`;
            }

            if (context.attachedFiles && context.attachedFiles.length > 0) {
                contextPrompt += `\n- Attached files:\n`;
                for (const file of context.attachedFiles) {
                    if (file.type === 'text' && file.content) {
                        const fileExtension = file.name.split('.').pop() || 'text';
                        contextPrompt += `\n--- ${file.name} (${(file.size / 1024).toFixed(1)} KB) ---\n`;
                        contextPrompt += `\`\`\`${fileExtension}\n${file.content}\n\`\`\`\n`;
                    } else if (file.type === 'image') {
                        contextPrompt += `\n--- ${file.name} (Image, ${(file.size / 1024).toFixed(1)} KB) ---\n`;
                        contextPrompt += `[Image file attached - content not displayed in text format]\n`;
                    } else {
                        contextPrompt += `\n--- ${file.name} (${file.type}, ${(file.size / 1024).toFixed(1)} KB) ---\n`;
                        contextPrompt += `[File attached but content not readable as text]\n`;
                    }
                }
            }

            if (context.attachedScreenshots && context.attachedScreenshots.length > 0) {
                contextPrompt += `\n- Attached screenshots:\n`;
                for (const screenshot of context.attachedScreenshots) {
                    contextPrompt += `\n--- ${screenshot.name} ---\n`;
                    contextPrompt += `[Screenshot attached - visual content not displayed in text format]\n`;
                }
            }

            systemMessages.push({
                role: 'system',
                content: contextPrompt
            });
        }

        return [...systemMessages, ...messages];
    }
}
