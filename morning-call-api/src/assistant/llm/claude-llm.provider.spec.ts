import { of, throwError } from 'rxjs';
import { ClaudeLlmProvider } from './claude-llm.provider';

describe('ClaudeLlmProvider', () => {
  const apiKey = 'server-secret-key';
  let http: { post: jest.Mock };

  beforeEach(() => {
    http = { post: jest.fn() };
  });

  it('reports configuration without exposing the API key', () => {
    const provider = new ClaudeLlmProvider(http as any, {
      apiKey,
      model: 'claude-sonnet-5-5',
    });

    const status = provider.getStatus();
    expect(status).toEqual({
      provider: 'claude',
      model: 'claude-sonnet-5-5',
      configured: true,
    });
    expect(JSON.stringify(status)).not.toContain(apiKey);
  });

  it('rejects before making a request when the key is blank', async () => {
    const provider = new ClaudeLlmProvider(http as any, {
      apiKey: '   ',
      model: 'claude-sonnet-5-5',
    });

    await expect(
      provider.generateText({
        systemPrompt: 'system',
        messages: [{ role: 'user', content: 'hello' }],
      }),
    ).rejects.toThrow('Claude is not configured.');
    expect(http.post).not.toHaveBeenCalled();
  });

  it('calls the Messages API and joins all text blocks', async () => {
    http.post.mockReturnValue(
      of({
        data: {
          content: [
            { type: 'text', text: '첫 문장' },
            { type: 'tool_use', id: 'ignored' },
            { type: 'text', text: '둘째 문장' },
          ],
        },
      }),
    );
    const provider = new ClaudeLlmProvider(http as any, {
      apiKey,
      model: 'claude-sonnet-5-5',
      timeoutMs: 1234,
    });

    await expect(
      provider.generateText({
        systemPrompt: 'system',
        messages: [{ role: 'user', content: 'hello' }],
        maxTokens: 321,
      }),
    ).resolves.toBe('첫 문장\n둘째 문장');

    expect(http.post).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-sonnet-5-5',
        max_tokens: 321,
        system: 'system',
        messages: [{ role: 'user', content: 'hello' }],
        thinking: { type: 'between_tools' },
        output_config: { effort: 'low' },
      },
      {
        headers: {
          'content-type': 'application/json',
          'anthropic-version': '2023-06-01',
          'x-api-key': apiKey,
        },
        timeout: 1234,
      },
    );
  });

  it('does not force Sonnet 5.5 options and caps provider timeout', async () => {
    http.post.mockReturnValue(
      of({ data: { content: [{ type: 'text', text: 'ok' }] } }),
    );
    const provider = new ClaudeLlmProvider(http as any, {
      apiKey,
      model: 'claude-haiku-4-5',
      timeoutMs: 60_000,
    });

    await provider.generateText({
      systemPrompt: 'system',
      messages: [{ role: 'user', content: 'hello' }],
    });

    const [, body, options] = http.post.mock.calls[0];
    expect(body).not.toHaveProperty('thinking');
    expect(body).not.toHaveProperty('output_config');
    expect(options.timeout).toBe(20_000);
  });

  it('rejects truncated and text-free responses for deterministic fallback', async () => {
    const provider = new ClaudeLlmProvider(http as any, {
      apiKey,
      model: 'claude-sonnet-5-5',
    });
    const request = {
      systemPrompt: 'system',
      messages: [{ role: 'user' as const, content: 'hello' }],
    };

    http.post.mockReturnValueOnce(
      of({
        data: {
          stop_reason: 'max_tokens',
          content: [{ type: 'text', text: 'partial answer' }],
        },
      }),
    );
    await expect(provider.generateText(request)).rejects.toThrow(
      'Claude response exceeded the output limit.',
    );

    http.post.mockReturnValueOnce(
      of({ data: { stop_reason: 'end_turn', content: [] } }),
    );
    await expect(provider.generateText(request)).rejects.toThrow(
      'Claude returned no text.',
    );
  });

  it('sanitizes upstream failures', async () => {
    http.post.mockReturnValue(
      throwError(() => ({
        response: { status: 429, data: { apiKey } },
        config: { headers: { 'x-api-key': apiKey } },
      })),
    );
    const provider = new ClaudeLlmProvider(http as any, {
      apiKey,
      model: 'claude-sonnet-5-5',
    });

    let message = '';
    try {
      await provider.generateText({
        systemPrompt: 'system',
        messages: [{ role: 'user', content: 'hello' }],
      });
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toBe('Claude request failed with status 429.');
    expect(message).not.toContain(apiKey);
  });
});
