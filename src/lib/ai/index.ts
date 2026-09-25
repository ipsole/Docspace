/**
 * FUTURE AI SUPPORT - ABSTRACTION LAYER
 * Prepared for DocSpace
 */

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIResponse {
  content: string;
  tokensUsed?: {
    prompt: number;
    completion: number;
    total: number;
  };
  provider: string;
  model: string;
}

export interface AIProviderOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Base Interface for LLM Providers
 * Supported future integrations: OpenAI, Gemini, Claude, Ollama, LM Studio
 */
export interface LLMProvider {
  id: string;
  name: string;
  generateResponse(messages: AIMessage[], options?: AIProviderOptions): Promise<AIResponse>;
  generateResponseStream?(messages: AIMessage[], options?: AIProviderOptions): AsyncGenerator<string, void, unknown>;
}

/**
 * Memory Management
 * Long-term, short-term, and episodic memory configurations.
 */
export interface AIMemoryManager {
  saveMemory(userId: string, key: string, value: string): Promise<void>;
  retrieveMemory(userId: string, query: string, limit?: number): Promise<string[]>;
  clearMemory(userId: string): Promise<void>;
}

/**
 * Context Builder
 * Responsible for compiling chat logs, system prompts, user profile details,
 * and retrieved memory segments into a unified context window.
 */
export interface AIContextBuilder {
  buildContext(
    chatId: string, 
    userId: string, 
    extraContext?: string
  ): Promise<AIMessage[]>;
}

/**
 * Agent Framework
 * Allows running multi-agent tasks, workflows, and tool calls.
 */
export interface AIAgent {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  execute(input: string, context: AIMessage[]): Promise<string>;
}
