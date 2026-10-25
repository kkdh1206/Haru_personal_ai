import {
  BadRequestException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AssistantService } from './assistant.service';
import { LlmProviderError } from './llm/llm-provider';

describe('AssistantService', () => {
  const userId = '507f1f77bcf86cd799439011';
  const taskId = '507f191e810c19729de860ea';
  const user = {
    _id: { toString: () => userId },
    name: '테스트',
    language: '한국어',
    timeZone: 'America/Toronto',
  };
  let calendar: any;
  let memory: any;
  let billing: any;
  let rateLimiter: any;
  let config: any;
  let llm: any;
  let service: AssistantService;
  let warn: jest.SpyInstance;

  const taskDocument = {
    _id: taskId,
    content: '논문 마감 확인',
    timestamp: new Date('2026-10-07T12:00:00.000Z'),
    metadata: {
      priority: 'high',
      dueAt: '2026-10-08T15:00:00.000Z',
      isCompleted: false,
      createdAt: '2026-10-07T12:00:00.000Z',
      completedAt: null,
    },
  };

  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    calendar = {
      getMorningCallContext: jest.fn().mockResolvedValue({
        provider: 'google',
        status: 'ok',
        events: [
          {
            id: 'event-1',
            summary: '연구 미팅',
            start: '2026-10-07T14:00:00-04:00',
            end: '2026-10-07T15:00:00-04:00',
          },
        ],
      }),
    };
    memory = {
      getReminders: jest.fn().mockResolvedValue([taskDocument]),
      getContext: jest.fn().mockResolvedValue({
        longTermMemories: [{ _id: 'memory-1', summary: 'FFX 연구를 진행 중' }],
      }),
      searchMemories: jest
        .fn()
        .mockResolvedValue([{ _id: 'memory-1', content: 'FFX 연구 중' }]),
      saveReminder: jest.fn().mockResolvedValue(taskDocument),
      updateReminderForUser: jest.fn().mockResolvedValue(taskDocument),
      deleteReminderForUser: jest.fn().mockResolvedValue({ success: true }),
    };
    billing = {
      canUseMorningCall: jest.fn().mockResolvedValue(true),
    };
    rateLimiter = {
      tryAcquire: jest.fn().mockReturnValue(true),
    };
    config = {
      get: jest.fn().mockReturnValue(undefined),
    };
    llm = {
      getStatus: jest.fn().mockReturnValue({
        provider: 'claude',
        model: 'claude-sonnet-5-5',
        configured: true,
      }),
      generateText: jest
        .fn()
        .mockResolvedValue('오늘은 연구 미팅과 논문 마감을 챙기세요.'),
    };
    service = new AssistantService(
      calendar,
      memory,
      billing,
      rateLimiter,
      config,
      llm,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('builds a stable structured briefing from authenticated user data', async () => {
    const result = await service.getBriefing(user);

    expect(calendar.getMorningCallContext).toHaveBeenCalledWith(userId);
    expect(memory.getReminders).toHaveBeenCalledWith(userId);
    expect(memory.getContext).toHaveBeenCalledWith(userId);
    expect(billing.canUseMorningCall).toHaveBeenCalledWith(userId);
    expect(rateLimiter.tryAcquire).toHaveBeenCalledWith(userId, 'briefing');
    expect(result).toMatchObject({
      timeZone: 'America/Toronto',
      summary: '오늘은 연구 미팅과 논문 마감을 챙기세요.',
      ai: {
        provider: 'claude',
        model: 'claude-sonnet-5-5',
        generated: true,
        fallback: false,
      },
      sources: { calendar: 'ok', tasks: 'ok', memory: 'ok' },
      sections: [
        {
          type: 'schedule',
          status: 'ok',
          items: [
            expect.objectContaining({ id: 'event-1', title: '연구 미팅' }),
          ],
        },
        {
          type: 'tasks',
          status: 'ok',
          items: [
            expect.objectContaining({
              id: taskId,
              title: '논문 마감 확인',
              priority: 'high',
            }),
          ],
        },
        {
          type: 'memory',
          status: 'ok',
          items: [expect.objectContaining({ title: 'FFX 연구를 진행 중' })],
        },
      ],
    });
    expect(result.generatedAt).toEqual(expect.any(String));
    expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('keeps healthy sections and uses a deterministic fallback on partial failures', async () => {
    calendar.getMorningCallContext.mockRejectedValue(
      new Error('calendar down'),
    );
    memory.getContext.mockRejectedValue(new Error('memory down'));
    llm.generateText.mockRejectedValue(new Error('provider down'));

    const result = await service.getBriefing(user);

    expect(result.sources).toEqual({
      calendar: 'unavailable',
      tasks: 'ok',
      memory: 'unavailable',
    });
    expect(result.sections[1].items).toHaveLength(1);
    expect(result.ai).toMatchObject({ generated: false, fallback: true });
    expect(result.summary).toContain('일정은 아직 확인하지 못했어요');
    expect(result.summary).toContain('남은 할 일은 1개');
  });

  it('does not call Claude when it is not configured', async () => {
    llm.getStatus.mockReturnValue({
      provider: 'claude',
      model: 'claude-sonnet-5-5',
      configured: false,
    });

    const result = await service.getBriefing(user);

    expect(llm.generateText).not.toHaveBeenCalled();
    expect(billing.canUseMorningCall).not.toHaveBeenCalled();
    expect(result.ai).toEqual({
      provider: 'claude',
      model: 'claude-sonnet-5-5',
      generated: false,
      fallback: true,
    });
  });

  it('creates and lists tasks using only the authenticated user id', async () => {
    await service.createTask(user, {
      title: '  논문 마감 확인  ',
      priority: 'high',
      dueAt: '2026-10-08T11:00:00-04:00',
    });
    await service.getTasks(user, true);

    expect(memory.saveReminder).toHaveBeenCalledWith({
      userId,
      content: '논문 마감 확인',
      priority: 'high',
      dueAt: '2026-10-08T15:00:00.000Z',
    });
    expect(memory.getReminders).toHaveBeenLastCalledWith(userId, {
      includeCompleted: true,
    });
    expect(billing.canUseMorningCall).not.toHaveBeenCalled();
    expect(rateLimiter.tryAcquire).not.toHaveBeenCalled();
  });

  it('returns 503 instead of an empty list when direct task reads time out', async () => {
    jest.useFakeTimers();
    config.get.mockReturnValue(100);
    service = new AssistantService(
      calendar,
      memory,
      billing,
      rateLimiter,
      config,
      llm,
    );
    memory.getReminders.mockReturnValue(new Promise<any>(() => undefined));

    const pending = expect(service.getTasks(user)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await jest.advanceTimersByTimeAsync(100);

    await pending;
    expect(jest.getTimerCount()).toBe(0);
  });

  it('scopes task updates and deletes to the authenticated user', async () => {
    await service.updateTask(user, taskId, { completed: true });
    await service.deleteTask(user, taskId);

    expect(memory.updateReminderForUser).toHaveBeenCalledWith(userId, taskId, {
      completed: true,
    });
    expect(memory.deleteReminderForUser).toHaveBeenCalledWith(userId, taskId);
  });

  it('rejects invalid task input and reports missing owned tasks', async () => {
    await expect(
      service.createTask(user, { title: '   ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.createTask(user, { title: 'task', dueAt: 'not-a-date' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    memory.updateReminderForUser.mockResolvedValue(null);
    await expect(
      service.updateTask(user, taskId, { title: '다른 제목' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('grounds chat in current data and falls back without failing the request', async () => {
    const generated = await service.chat(user, {
      message: ' 오늘 해야 할 일은? ',
      history: [{ role: 'assistant', content: '무엇을 도와줄까?' }],
    });
    expect(generated).toMatchObject({
      reply: '오늘은 연구 미팅과 논문 마감을 챙기세요.',
      fallback: false,
    });
    expect(memory.searchMemories).toHaveBeenCalledWith(
      userId,
      '오늘 해야 할 일은?',
      5,
    );
    expect(billing.canUseMorningCall).toHaveBeenCalledWith(userId);
    expect(rateLimiter.tryAcquire).toHaveBeenCalledWith(userId, 'chat');
    expect(llm.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          { role: 'assistant', content: '무엇을 도와줄까?' },
          { role: 'user', content: '오늘 해야 할 일은?' },
        ],
      }),
    );

    llm.generateText.mockRejectedValue(new Error('Claude down'));
    const fallback = await service.chat(user, { message: '할 일 알려줘' });
    expect(fallback.fallback).toBe(true);
    expect(fallback.reply).toContain('논문 마감 확인');
  });

  it('does not make paid calls without an active enforced entitlement', async () => {
    billing.canUseMorningCall.mockResolvedValue(false);

    const briefing = await service.getBriefing(user);
    const chat = await service.chat(user, { message: '오늘 일정 알려줘' });

    expect(briefing.ai).toMatchObject({ generated: false, fallback: true });
    expect(chat.fallback).toBe(true);
    expect(llm.generateText).not.toHaveBeenCalled();
    expect(rateLimiter.tryAcquire).not.toHaveBeenCalled();
    expect(briefing.sections[0].items).toHaveLength(1);
  });

  it('uses the same fallback after the per-user AI limit is reached', async () => {
    rateLimiter.tryAcquire.mockReturnValue(false);

    const briefing = await service.getBriefing(user);
    const chat = await service.chat(user, { message: '할 일 알려줘' });

    expect(briefing.ai).toMatchObject({ generated: false, fallback: true });
    expect(chat).toMatchObject({ fallback: true });
    expect(chat.reply).toContain('논문 마감 확인');
    expect(llm.generateText).not.toHaveBeenCalled();
  });

  it('fails closed when entitlement lookup is unavailable', async () => {
    billing.canUseMorningCall.mockRejectedValue(
      new Error('billing unavailable'),
    );

    const result = await service.getBriefing(user);

    expect(result.ai.fallback).toBe(true);
    expect(llm.generateText).not.toHaveBeenCalled();
    expect(rateLimiter.tryAcquire).not.toHaveBeenCalled();
  });

  it('bounds sources and entitlement in one parallel preflight window', async () => {
    jest.useFakeTimers();
    config.get.mockReturnValue(100);
    service = new AssistantService(
      calendar,
      memory,
      billing,
      rateLimiter,
      config,
      llm,
    );

    const never = new Promise<any>(() => undefined);
    let rejectMemory!: (error: Error) => void;
    calendar.getMorningCallContext.mockReturnValue(never);
    memory.getContext.mockReturnValue(
      new Promise((_, reject) => {
        rejectMemory = reject;
      }),
    );
    billing.canUseMorningCall.mockReturnValue(never);

    const pending = service.getBriefing(user);
    let settled = false;
    void pending.then(() => {
      settled = true;
    });

    await jest.advanceTimersByTimeAsync(99);
    expect(settled).toBe(false);
    await jest.advanceTimersByTimeAsync(1);

    const result = await pending;
    expect(result.sources).toEqual({
      calendar: 'unavailable',
      tasks: 'ok',
      memory: 'unavailable',
    });
    expect(result.ai).toMatchObject({ generated: false, fallback: true });
    expect(llm.generateText).not.toHaveBeenCalled();
    expect(rateLimiter.tryAcquire).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);

    // The timeout race keeps a rejection handler attached to late failures.
    rejectMemory(new Error('late memory failure'));
    await Promise.resolve();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('bounds chat sources and returns its deterministic fallback', async () => {
    jest.useFakeTimers();
    config.get.mockReturnValue(100);
    llm.getStatus.mockReturnValue({
      provider: 'claude',
      model: 'claude-sonnet-5-5',
      configured: false,
    });
    service = new AssistantService(
      calendar,
      memory,
      billing,
      rateLimiter,
      config,
      llm,
    );
    const never = new Promise<any>(() => undefined);
    calendar.getMorningCallContext.mockReturnValue(never);
    memory.searchMemories.mockReturnValue(never);

    const pending = service.chat(user, { message: '오늘 일정 알려줘' });
    await jest.advanceTimersByTimeAsync(100);
    const result = await pending;

    expect(result).toMatchObject({ fallback: true });
    expect(result.reply).toContain('캘린더를 확인하지 못했어요');
    expect(billing.canUseMorningCall).not.toHaveBeenCalled();
    expect(llm.generateText).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('logs only sanitized provider diagnostics before falling back', async () => {
    const secret = 'server-secret-key';
    const unsafeError = new Error(`request body contained ${secret}`);
    unsafeError.name = secret;
    llm.generateText
      .mockRejectedValueOnce(
        new LlmProviderError('Claude request failed with status 429.'),
      )
      .mockRejectedValueOnce(unsafeError);

    await service.getBriefing(user);
    await service.chat(user, { message: '오늘 일정 알려줘' });

    const messages = warn.mock.calls.flat().join(' ');
    expect(messages).toContain('status 429');
    expect(messages).toContain('Unexpected provider failure.');
    expect(messages).not.toContain(secret);
    expect(messages).not.toContain('request body contained');
  });
});
