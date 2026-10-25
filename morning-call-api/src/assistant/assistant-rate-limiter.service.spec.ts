import { AssistantRateLimiter } from './assistant-rate-limiter.service';

describe('AssistantRateLimiter', () => {
  function makeLimiter(values: Record<string, unknown> = {}) {
    return new AssistantRateLimiter({
      get: jest.fn((key: string) => values[key]),
    } as any);
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('enforces independent fixed windows per user and operation', () => {
    let now = 1_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    const limiter = makeLimiter({
      'assistant.rateLimit.windowMs': 1_000,
      'assistant.rateLimit.briefingLimit': 2,
      'assistant.rateLimit.chatLimit': 1,
    });

    expect(limiter.tryAcquire('user-1', 'briefing')).toBe(true);
    expect(limiter.tryAcquire('user-1', 'briefing')).toBe(true);
    expect(limiter.tryAcquire('user-1', 'briefing')).toBe(false);
    expect(limiter.tryAcquire('user-2', 'briefing')).toBe(true);
    expect(limiter.tryAcquire('user-1', 'chat')).toBe(true);
    expect(limiter.tryAcquire('user-1', 'chat')).toBe(false);

    now += 1_000;
    expect(limiter.tryAcquire('user-1', 'briefing')).toBe(true);
    expect(limiter.tryAcquire('user-1', 'chat')).toBe(true);
  });

  it('treats a zero endpoint limit as no paid AI calls', () => {
    const limiter = makeLimiter({
      'assistant.rateLimit.briefingLimit': 0,
      'assistant.rateLimit.chatLimit': 0,
    });

    expect(limiter.tryAcquire('user-1', 'briefing')).toBe(false);
    expect(limiter.tryAcquire('user-1', 'chat')).toBe(false);
  });

  it('uses safe defaults for invalid configuration', () => {
    const limiter = makeLimiter({
      'assistant.rateLimit.windowMs': 'invalid',
      'assistant.rateLimit.briefingLimit': -2,
      'assistant.rateLimit.chatLimit': Number.NaN,
    });

    for (let index = 0; index < 12; index += 1) {
      expect(limiter.tryAcquire('user-1', 'briefing')).toBe(true);
    }
    expect(limiter.tryAcquire('user-1', 'briefing')).toBe(false);
  });
});
