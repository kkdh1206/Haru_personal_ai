import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type AssistantAiOperation = 'briefing' | 'chat';

type FixedWindowEntry = {
  startedAt: number;
  count: number;
};

/**
 * In-memory fixed-window limiter for a single backend instance.
 * A distributed deployment should replace this with a shared Redis limiter.
 */
@Injectable()
export class AssistantRateLimiter {
  private readonly entries = new Map<string, FixedWindowEntry>();
  private readonly windowMs: number;
  private readonly limits: Record<AssistantAiOperation, number>;

  constructor(config: ConfigService) {
    this.windowMs = this.positiveNumber(
      config.get('assistant.rateLimit.windowMs'),
      3_600_000,
    );
    this.limits = {
      briefing: this.nonNegativeNumber(
        config.get('assistant.rateLimit.briefingLimit'),
        12,
      ),
      chat: this.nonNegativeNumber(
        config.get('assistant.rateLimit.chatLimit'),
        60,
      ),
    };
  }

  tryAcquire(userId: string, operation: AssistantAiOperation): boolean {
    const limit = this.limits[operation];
    if (limit === 0) return false;

    const now = Date.now();
    const key = `${operation}:${userId}`;
    const current = this.entries.get(key);

    if (!current || now - current.startedAt >= this.windowMs) {
      this.entries.set(key, { startedAt: now, count: 1 });
      return true;
    }

    if (current.count >= limit) return false;
    current.count += 1;
    return true;
  }

  private positiveNumber(value: unknown, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0
      ? Math.floor(parsed)
      : fallback;
  }

  private nonNegativeNumber(value: unknown, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0
      ? Math.floor(parsed)
      : fallback;
  }
}
