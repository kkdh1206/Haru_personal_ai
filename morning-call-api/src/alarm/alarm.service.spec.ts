jest.mock('src/livekit/livekit.service', () => ({
  LivekitService: class LivekitService {},
}));
jest.mock('src/prompt/prompt.service', () => ({
  PromptService: class PromptService {},
}));
jest.mock('src/user/user.service', () => ({
  UserService: class UserService {},
}));
jest.mock('src/apns/apns.service', () => ({
  ApnsService: class ApnsService {},
}));
jest.mock('src/fcm/fcm.service', () => ({
  FcmService: class FcmService {},
}));

import { AlarmService } from './alarm.service';

describe('AlarmService scheduling', () => {
  const fixedNow = Date.parse('2026-06-27T23:00:00.000Z');

  function makeAlarm(overrides: Record<string, any> = {}) {
    return {
      _id: 'alarm-id',
      userId: 'user-id',
      role: '하루',
      wakeIntensity: 'firm',
      voice: 'Charon',
      time: '09:00',
      targetDate: '2026-06-29',
      timeZone: 'Asia/Seoul',
      isOn: true,
      repeatDays: [],
      dailyRetryCount: 0,
      retryTrackingDate: '2026-06-28',
      retryLimitNoticeDate: null,
      save: jest.fn().mockResolvedValue(undefined),
      toObject() {
        const { save, toObject, ...alarm } = this as any;
        return alarm;
      },
      ...overrides,
    };
  }

  function makeService(overrides: Record<string, any> = {}) {
    const queue = {
      add: jest.fn().mockImplementation(async (_name, _data, options) => ({
        id: options.jobId,
        getState: jest.fn().mockResolvedValue('delayed'),
      })),
      getJob: jest.fn().mockResolvedValue(null),
    };
    const alarmModel = {
      create: jest.fn().mockImplementation(async (dto) => makeAlarm(dto)),
      findById: jest.fn().mockResolvedValue(makeAlarm()),
    };
    const livekit = {
      ensureRoom: jest.fn().mockResolvedValue(undefined),
      prewarmAgent: jest.fn().mockResolvedValue(undefined),
      waitForAgentParticipant: jest.fn().mockResolvedValue(undefined),
      generateLivkitToken: jest.fn().mockResolvedValue('lk-token'),
    };
    const promptService = {
      getPrompt: jest.fn().mockResolvedValue('prompt'),
      getTestCallPrompt: jest.fn().mockResolvedValue('test prompt'),
    };
    const userService = {
      getUserDeviceToken: jest.fn().mockResolvedValue({
        deviceToken: 'device-token',
        deviceType: 'android',
      }),
      findOne: jest.fn().mockResolvedValue({ name: '사용자' }),
    };
    const fcmService = {
      sendCallPush: jest.fn().mockResolvedValue({ sent: [{}], failed: [] }),
      sendWakeFollowupPush: jest
        .fn()
        .mockResolvedValue({ sent: [{}], failed: [] }),
    };
    const apnsService = {
      sendVoipPush: jest.fn().mockResolvedValue({ sent: [{}], failed: [] }),
      sendWakeFollowupPush: jest
        .fn()
        .mockResolvedValue({ sent: [{}], failed: [] }),
    };
    const configService = {
      getOrThrow: jest.fn().mockReturnValue('wss://livekit.test'),
      get: jest.fn((path: string) => {
        const values = {
          'alarm.prewarmLeadSeconds': '20',
          'alarm.retryMinutes': '2',
          'alarm.maxDailyRetryCalls': '3',
          'alarm.callAgentCheckTimeoutMs': '1000',
        };
        return values[path];
      }),
    };

    const service = new AlarmService(
      overrides.livekit || livekit,
      overrides.apnsService || apnsService,
      overrides.fcmService || fcmService,
      overrides.userService || userService,
      overrides.promptService || promptService,
      overrides.alarmModel || (alarmModel as any),
      overrides.queue || (queue as any),
      overrides.configService || (configService as any),
    );

    return {
      service,
      queue,
      alarmModel,
      livekit,
      promptService,
      userService,
      fcmService,
      apnsService,
    };
  }

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(fixedNow);
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('schedules one-time prewarm 20 seconds before the on-time call job', async () => {
    const { service, queue } = makeService();

    await service.createAlarm('user-id', {
      time: '09:00',
      targetDate: '2026-06-29',
      timeZone: 'Asia/Seoul',
      isOn: true,
      repeatDays: [],
    } as any);

    expect(queue.add).toHaveBeenCalledTimes(2);
    expect(queue.add).toHaveBeenNthCalledWith(
      1,
      'trigger',
      expect.objectContaining({ action: 'prewarm' }),
      expect.objectContaining({
        jobId: 'alarm-id-once-prewarm',
        delay: Date.parse('2026-06-28T23:59:40.000Z') - fixedNow,
      }),
    );
    expect(queue.add).toHaveBeenNthCalledWith(
      2,
      'trigger',
      expect.objectContaining({ action: 'call' }),
      expect.objectContaining({
        jobId: 'alarm-id-once-call',
        delay: Date.parse('2026-06-29T00:00:00.000Z') - fixedNow,
      }),
    );
  });

  it('normalizes unsupported wake intensity values to gentle', async () => {
    const { service } = makeService();

    const alarm = await service.createAlarm('user-id', {
      time: '09:00',
      targetDate: '2026-06-29',
      timeZone: 'Asia/Seoul',
      wakeIntensity: 'tsundere',
      isOn: true,
      repeatDays: [],
    } as any);

    expect(alarm.wakeIntensity).toBe('gentle');
    expect(alarm.personality).toBe('gentle');
  });

  it('defaults retry calls to two minutes with a prewarm job first', async () => {
    const alarm = makeAlarm();
    const alarmModel = { findById: jest.fn().mockResolvedValue(alarm) };
    const { service, queue } = makeService({ alarmModel });

    await service.scheduleRetryCall('alarm-id');

    expect(queue.add).toHaveBeenCalledTimes(2);
    expect(queue.add).toHaveBeenNthCalledWith(
      1,
      'trigger',
      expect.objectContaining({
        action: 'prewarm',
        retry: true,
        retryMinutes: 2,
      }),
      expect.objectContaining({
        jobId: 'alarm-id-retry-prewarm',
        delay: 100000,
      }),
    );
    expect(queue.add).toHaveBeenNthCalledWith(
      2,
      'trigger',
      expect.objectContaining({
        action: 'call',
        retry: true,
        retryMinutes: 2,
      }),
      expect.objectContaining({
        jobId: 'alarm-id-retry-call',
        delay: 120000,
      }),
    );
  });

  it('does not build prompt or dispatch agent on the on-time call path', async () => {
    const { service, livekit, promptService, fcmService } = makeService();
    livekit.waitForAgentParticipant.mockRejectedValueOnce(
      new Error('agent not visible yet'),
    );

    await service.call(makeAlarm());

    expect(promptService.getPrompt).not.toHaveBeenCalled();
    expect(livekit.prewarmAgent).not.toHaveBeenCalled();
    expect(livekit.waitForAgentParticipant).toHaveBeenCalledWith(
      'alarm-id',
      1000,
    );
    expect(fcmService.sendCallPush).toHaveBeenCalledWith('device-token', {
      caller: '하루',
      lkUrl: 'wss://livekit.test',
      lkToken: 'lk-token',
      alarmId: 'alarm-id',
    });
  });
});
