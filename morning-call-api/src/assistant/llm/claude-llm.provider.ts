import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import {
  GenerateTextRequest,
  LlmProvider,
  LlmProviderError,
  LlmProviderStatus,
} from './llm-provider';

type ClaudeTextBlock = {
  type?: string;
  text?: string;
};

type ClaudeMessagesResponse = {
  content?: ClaudeTextBlock[];
  stop_reason?: string | null;
};

export type ClaudeLlmOptions = {
  apiKey: string;
  model: string;
  baseUrl?: string;
  timeoutMs?: number;
};

/** Server-side Claude Messages API adapter. The API key never leaves this class. */
export class ClaudeLlmProvider implements LlmProvider {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(
    private readonly http: HttpService,
    options: ClaudeLlmOptions,
  ) {
    this.apiKey = options.apiKey.trim();
    this.model = options.model.trim() || 'claude-sonnet-5-5';
    this.baseUrl = (options.baseUrl || 'https://api.anthropic.com').replace(
      /\/$/,
      '',
    );
    const configuredTimeout = Number(options.timeoutMs);
    this.timeoutMs =
      Number.isFinite(configuredTimeout) && configuredTimeout > 0
        ? Math.min(Math.floor(configuredTimeout), 20_000)
        : 20_000;
  }

  getStatus(): LlmProviderStatus {
    return {
      provider: 'claude',
      model: this.model,
      configured: Boolean(this.apiKey),
    };
  }

  async generateText(request: GenerateTextRequest): Promise<string> {
    if (!this.apiKey) {
      throw new LlmProviderError('Claude is not configured.');
    }

    try {
      const sonnet55Options =
        this.model === 'claude-sonnet-5-5'
          ? {
              thinking: { type: 'between_tools' },
              output_config: { effort: 'low' },
            }
          : {};
      const response = await firstValueFrom(
        this.http.post<ClaudeMessagesResponse>(
          `${this.baseUrl}/v1/messages`,
          {
            model: this.model,
            max_tokens: request.maxTokens || 700,
            system: request.systemPrompt,
            messages: request.messages,
            ...sonnet55Options,
          },
          {
            headers: {
              'content-type': 'application/json',
              'anthropic-version': '2023-06-01',
              'x-api-key': this.apiKey,
            },
            timeout: this.timeoutMs,
          },
        ),
      );

      if (response.data.stop_reason === 'max_tokens') {
        throw new LlmProviderError(
          'Claude response exceeded the output limit.',
        );
      }

      const text = (response.data.content || [])
        .filter((block) => block.type === 'text' && block.text)
        .map((block) => block.text?.trim() || '')
        .filter(Boolean)
        .join('\n')
        .trim();

      if (!text) {
        throw new LlmProviderError('Claude returned no text.');
      }

      return text;
    } catch (error) {
      if (error instanceof LlmProviderError) {
        throw error;
      }

      const status = (error as { response?: { status?: number } })?.response
        ?.status;
      throw new LlmProviderError(
        status
          ? `Claude request failed with status ${status}.`
          : 'Claude request failed.',
      );
    }
  }
}
