export const LLM_PROVIDER_TOKEN = Symbol('LLM_PROVIDER_TOKEN');

export type LlmRole = 'user' | 'assistant';

export interface LlmMessage {
  role: LlmRole;
  content: string;
}

export interface GenerateTextRequest {
  systemPrompt: string;
  messages: LlmMessage[];
  maxTokens?: number;
}

export interface LlmProviderStatus {
  provider: string;
  model: string;
  configured: boolean;
}

export interface LlmProvider {
  getStatus(): LlmProviderStatus;
  generateText(request: GenerateTextRequest): Promise<string>;
}

export class LlmProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LlmProviderError';
  }
}
