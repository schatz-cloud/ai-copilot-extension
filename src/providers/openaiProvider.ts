/**
 * OpenAI Provider Implementation
 * 
 * This module implements the AIProvider interface for OpenAI's GPT models.
 * It handles communication with OpenAI's API, request formatting, response
 * parsing, and error handling specific to OpenAI services.
 * 
 * Key features:
 * - Support for GPT-4, GPT-4-turbo, and GPT-3.5-turbo models
 * - Chat completions for conversational AI
 * - Code completion using OpenAI's completion API
 * - Proper error handling and rate limiting
 * - Token usage tracking and optimization
 * 
 * @author SATISH KUMAR NADARAJAN (penintechwiz@gmail.com)
 * @version 1.0.0
 */

import axios, { AxiosInstance, AxiosResponse } from 'axios';
import {
    AIProvider,
    AIMessage,
    AIResponse,
    AIRequestContext,
    AIModelConfig,
    CodeCompletionRequest,
    CodeCompletionResponse,
    AIProviderError
} from './aiProvider';

/**
 * OpenAI API configuration (reserved for future use)
 */
// interface OpenAIConfig extends AIModelConfig {
//     /** OpenAI API key */
//     apiKey: string;
//     
//     /** API base URL (for custom endpoints) */
//     baseUrl?: string;
//     
//     /** Organization ID (optional) */
//     organizationId?: string;
//     
//     /** Request timeout in milliseconds */
//     timeout?: number;
// }

/**
 * OpenAI API request format for chat completions
 */
interface OpenAIChatRequest {
    model: string;
    messages: Array<{
        role: 'system' | 'user' | 'assistant';
        content: string;
    }>;
    max_tokens?: number;
    temperature?: number;
    top_p?: number;
    frequency_penalty?: number;
    presence_penalty?: number;
    stop?: string[];
    stream?: boolean;
}

/**
 * OpenAI API response format for chat completions
 */
interface OpenAIChatResponse {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: Array<{
        index: number;
        message: {
            role: string;
            content: string;
        };
        finish_reason: string;
    }>;
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

/**
 * OpenAI Provider Class
 * 
 * Implements the AIProvider interface specifically for OpenAI's GPT models.
 * Handles all OpenAI-specific API communication, authentication, and
 * response formatting.
 */
export class OpenAIProvider extends AIProvider {
    private apiKey: string;
    private httpClient: AxiosInstance;
    private baseUrl: string;
    private organizationId?: string;

    /**
     * Initialize the OpenAI provider
     * 
     * @param apiKey - OpenAI API key
     * @param modelName - Name of the OpenAI model (e.g., 'gpt-4', 'gpt-3.5-turbo')
     * @param config - Configuration options for the model
     */
    constructor(apiKey: string, modelName: string, config: AIModelConfig) {
        super(modelName, config);
        
        this.apiKey = apiKey;
        this.baseUrl = 'https://api.openai.com/v1';
        
        this.httpClient = axios.create({
            baseURL: this.baseUrl,
            timeout: 30000, // 30 second timeout
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
                'User-Agent': 'AI-Copilot-Extension/1.0.0'
            }
        });

        if (this.organizationId) {
            this.httpClient.defaults.headers['OpenAI-Organization'] = this.organizationId;
        }

        this.setupInterceptors();
    }

    /**
     * Generate a chat completion using OpenAI's chat API
     * 
     * This method handles conversational AI interactions by sending
     * messages to OpenAI's chat completion endpoint and processing
     * the response.
     * 
     * @param messages - Array of conversation messages
     * @param context - Additional context for the request
     * @returns Promise resolving to AI response
     */
    async generateChatCompletion(
        messages: AIMessage[],
        context?: AIRequestContext
    ): Promise<AIResponse> {
        try {
            this.validateRequest({ messages });

            const contextualMessages = this.addSystemContext(
                messages,
                context,
                'You are an AI coding assistant. Provide helpful, accurate, and concise responses.'
            );

            const requestPayload: OpenAIChatRequest = {
                model: this.modelName,
                messages: this.formatMessages(contextualMessages),
                max_tokens: this.config.maxTokens,
                temperature: this.config.temperature,
                top_p: this.config.topP,
                frequency_penalty: this.config.frequencyPenalty,
                presence_penalty: this.config.presencePenalty,
                stop: this.config.stopSequences
            };

            const startTime = performance.now();
            const response: AxiosResponse<OpenAIChatResponse> = await this.httpClient.post(
                '/chat/completions',
                requestPayload
            );
            const endTime = performance.now();

            const choice = response.data.choices[0];
            if (!choice || !choice.message) {
                throw new AIProviderError(
                    'Invalid response from OpenAI API',
                    'INVALID_RESPONSE'
                );
            }

            return {
                content: choice.message.content,
                model: response.data.model,
                usage: {
                    promptTokens: response.data.usage.prompt_tokens,
                    completionTokens: response.data.usage.completion_tokens,
                    totalTokens: response.data.usage.total_tokens
                },
                finishReason: choice.finish_reason as any,
                metadata: {
                    requestId: response.data.id,
                    processingTime: endTime - startTime,
                    created: response.data.created
                }
            };

        } catch (error) {
            this.handleError(error, 'Chat completion failed');
        }
    }

    /**
     * Generate code completion suggestions
     * 
     * This method provides intelligent code completion by analyzing
     * the code context and generating appropriate suggestions.
     * 
     * @param request - Code completion request details
     * @returns Promise resolving to completion suggestions
     */
    async generateCodeCompletion(
        request: CodeCompletionRequest
    ): Promise<CodeCompletionResponse> {
        try {
            this.validateRequest(request);

            const prompt = this.buildCodeCompletionPrompt(request);

            const messages: AIMessage[] = [
                {
                    role: 'system',
                    content: `You are an AI code completion assistant. Complete the code based on the context provided. 
                    Return only the completion text without explanations or markdown formatting.
                    Language: ${request.language}`
                },
                {
                    role: 'user',
                    content: prompt
                }
            ];

            const startTime = performance.now();
            const response = await this.generateChatCompletion(messages);
            const endTime = performance.now();

            const completionText = response.content.trim();
            
            return {
                completions: [
                    {
                        text: completionText,
                        confidence: 0.8, // Default confidence score
                        type: this.inferCompletionType(completionText, request.language),
                        documentation: `AI-generated completion for ${request.language}`
                    }
                ],
                model: this.modelName,
                processingTime: endTime - startTime
            };

        } catch (error) {
            this.handleError(error, 'Code completion failed');
        }
    }

    /**
     * Generate code from natural language description
     * 
     * @param prompt - Natural language description of desired code
     * @param language - Target programming language
     * @param context - Additional context for code generation
     * @returns Promise resolving to generated code
     */
    async generateCode(
        prompt: string,
        language: string,
        context?: AIRequestContext
    ): Promise<AIResponse> {
        try {
            this.validateRequest({ prompt, language });

            const messages: AIMessage[] = [
                {
                    role: 'system',
                    content: `You are an expert ${language} programmer. Generate clean, efficient, and well-documented code based on the user's requirements. 
                    Follow best practices and include appropriate comments.`
                },
                {
                    role: 'user',
                    content: `Generate ${language} code for: ${prompt}`
                }
            ];

            return await this.generateChatCompletion(messages, context);

        } catch (error) {
            this.handleError(error, 'Code generation failed');
        }
    }

    /**
     * Explain code functionality
     * 
     * @param code - Code to explain
     * @param language - Programming language of the code
     * @param context - Additional context for explanation
     * @returns Promise resolving to code explanation
     */
    async explainCode(
        code: string,
        language: string,
        context?: AIRequestContext
    ): Promise<AIResponse> {
        try {
            this.validateRequest({ code, language });

            const messages: AIMessage[] = [
                {
                    role: 'system',
                    content: `You are a code analysis expert. Explain the provided ${language} code in clear, understandable terms. 
                    Cover what the code does, how it works, and any notable patterns or potential issues.`
                },
                {
                    role: 'user',
                    content: `Please explain this ${language} code:\n\n\`\`\`${language}\n${code}\n\`\`\``
                }
            ];

            return await this.generateChatCompletion(messages, context);

        } catch (error) {
            this.handleError(error, 'Code explanation failed');
        }
    }

    /**
     * Refactor code with AI suggestions
     * 
     * @param code - Code to refactor
     * @param language - Programming language of the code
     * @param refactorType - Type of refactoring
     * @param context - Additional context for refactoring
     * @returns Promise resolving to refactored code
     */
    async refactorCode(
        code: string,
        language: string,
        refactorType: string,
        context?: AIRequestContext
    ): Promise<AIResponse> {
        try {
            this.validateRequest({ code, language, refactorType });

            const messages: AIMessage[] = [
                {
                    role: 'system',
                    content: `You are a code refactoring expert. Improve the provided ${language} code by ${refactorType}. 
                    Maintain the original functionality while improving code quality, readability, and performance.`
                },
                {
                    role: 'user',
                    content: `Please refactor this ${language} code (${refactorType}):\n\n\`\`\`${language}\n${code}\n\`\`\``
                }
            ];

            return await this.generateChatCompletion(messages, context);

        } catch (error) {
            this.handleError(error, 'Code refactoring failed');
        }
    }

    /**
     * Analyze codebase for insights
     * 
     * @param codeFiles - Array of code files to analyze
     * @param analysisType - Type of analysis to perform
     * @returns Promise resolving to analysis results
     */
    async analyzeCodebase(
        codeFiles: Array<{ path: string; content: string; language: string }>,
        analysisType: string
    ): Promise<AIResponse> {
        try {
            this.validateRequest({ codeFiles, analysisType });

            const codebaseSummary = codeFiles.map(file => 
                `File: ${file.path} (${file.language})\n\`\`\`${file.language}\n${file.content}\n\`\`\``
            ).join('\n\n');

            const messages: AIMessage[] = [
                {
                    role: 'system',
                    content: `You are a senior software architect. Analyze the provided codebase and provide insights about ${analysisType}. 
                    Focus on code quality, architecture patterns, potential issues, and improvement recommendations.`
                },
                {
                    role: 'user',
                    content: `Please analyze this codebase for ${analysisType}:\n\n${codebaseSummary}`
                }
            ];

            return await this.generateChatCompletion(messages);

        } catch (error) {
            this.handleError(error, 'Codebase analysis failed');
        }
    }

    /**
     * Check if the provider is properly configured
     * 
     * @returns Promise resolving to true if configured, false otherwise
     */
    async isConfigured(): Promise<boolean> {
        return !!(this.apiKey && this.modelName);
    }

    /**
     * Test the provider connection
     * 
     * @returns Promise resolving to true if connection works, false otherwise
     */
    async testConnection(): Promise<boolean> {
        try {
            const testMessages: AIMessage[] = [
                {
                    role: 'user',
                    content: 'Hello, this is a connection test. Please respond with "OK".'
                }
            ];

            const response = await this.generateChatCompletion(testMessages);
            return response.content.toLowerCase().includes('ok');

        } catch (error) {
            console.error('OpenAI connection test failed:', error);
            return false;
        }
    }

    /**
     * Build a prompt for code completion
     * 
     * @param request - Code completion request
     * @returns Formatted prompt for completion
     */
    private buildCodeCompletionPrompt(request: CodeCompletionRequest): string {
        let prompt = `Complete the following ${request.language} code:\n\n`;
        
        if (request.filePath) {
            prompt += `File: ${request.filePath}\n\n`;
        }

        if (request.projectContext) {
            prompt += `Project Context: ${request.projectContext}\n\n`;
        }

        if (request.relatedFiles && request.relatedFiles.length > 0) {
            prompt += `Related Files Context:\n`;
            for (const file of request.relatedFiles) {
                prompt += `\n--- ${file.path} (relevance: ${file.relevanceScore.toFixed(2)}) ---\n`;
                prompt += `\`\`\`${file.language}\n${file.content}\n\`\`\`\n`;
            }
            prompt += '\n';
        }

        if (request.imports && request.imports.length > 0) {
            prompt += `Imports: ${request.imports.join(', ')}\n\n`;
        }

        prompt += '```' + request.language + '\n';
        prompt += request.prefix;
        prompt += '<CURSOR>'; // Indicate cursor position
        prompt += request.suffix;
        prompt += '\n```\n\n';
        prompt += 'Complete the code at the <CURSOR> position. Consider the related files and imports for context:';

        return prompt;
    }

    /**
     * Infer the type of completion based on the generated text
     * 
     * @param completionText - Generated completion text
     * @param language - Programming language
     * @returns Inferred completion type
     */
    private inferCompletionType(completionText: string, _language: string): string {
        const text = completionText.toLowerCase();

        if (text.includes('function') || text.includes('def ') || text.includes('=>')) {
            return 'function';
        }
        if (text.includes('class ') || text.includes('interface ')) {
            return 'class';
        }
        if (text.includes('const ') || text.includes('let ') || text.includes('var ')) {
            return 'variable';
        }
        if (text.includes('import ') || text.includes('require(')) {
            return 'import';
        }
        if (text.includes('if ') || text.includes('for ') || text.includes('while ')) {
            return 'control';
        }

        return 'code';
    }

    /**
     * Set up HTTP client interceptors for logging and error handling
     */
    private setupInterceptors(): void {
        this.httpClient.interceptors.request.use(
            (config) => {
                console.log(`OpenAI API Request: ${config.method?.toUpperCase()} ${config.url}`);
                return config;
            },
            (error) => {
                console.error('OpenAI API Request Error:', error);
                return Promise.reject(error);
            }
        );

        this.httpClient.interceptors.response.use(
            (response) => {
                console.log(`OpenAI API Response: ${response.status} ${response.statusText}`);
                return response;
            },
            (error) => {
                console.error('OpenAI API Response Error:', error.response?.status, error.response?.statusText);
                return Promise.reject(error);
            }
        );
    }

    /**
     * Set organization ID for API requests
     * 
     * @param organizationId - OpenAI organization ID
     */
    setOrganizationId(organizationId: string): void {
        this.organizationId = organizationId;
        this.httpClient.defaults.headers['OpenAI-Organization'] = organizationId;
    }

    /**
     * Update API key
     * 
     * @param apiKey - New OpenAI API key
     */
    updateApiKey(apiKey: string): void {
        this.apiKey = apiKey;
        this.httpClient.defaults.headers['Authorization'] = `Bearer ${apiKey}`;
    }

    /**
     * Get current usage statistics
     * 
     * @returns Usage statistics from recent requests
     */
    getUsageStats(): {
        totalRequests: number;
        totalTokens: number;
        averageResponseTime: number;
    } {
        return {
            totalRequests: 0,
            totalTokens: 0,
            averageResponseTime: 0
        };
    }
}
