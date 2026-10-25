import {
  LlmProvider,
  LlmProviderError,
  LlmProviderStatus,
} from './llm-provider';

export class UnavailableLlmProvider implements LlmProvider {
  constructor(
    private readonly provider: string,
    private readonly model: string,
  ) {}

  getStatus(): LlmProviderStatus {
    return {
      provider: this.provider,
      model: this.model,
      configured: false,
    };
  }

  async generateText(): Promise<string> {
    throw new LlmProviderError(
      `LLM provider "${this.provider}" is not available.`,
    );
  }
}
