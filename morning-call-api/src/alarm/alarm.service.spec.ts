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
import { Settings } from 'luxon';

describe('AlarmService scheduling', () => {
  const fixedNow = Date.parse('2026-06-27T23:00:00.000Z');

  function makeAlarm(overrides: Record<string, any> = {}) {
    return {
      _id: 'alarm-id',
      userId: 'user-id',
      role: '하루',
      wakeIntensity: 'firm',
      voice: 'Achird',
      time: '09:00',
      targetDate: '2026-06-29',
      timeZone: 'Asia/Seoul',
      isOn: true,
      repeatDays: [],
      dailyRetryCount: 0,
      retryTrackingDate: '2026-06-28',
      retryLimitNoticeDate: null,
      lastAwakeAt: null as Date | null,
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
      getJobs: jest.fn().mockResolvedValue([]),
    };
    const alarmModel = {
      create: jest.fn().mockImplementation(async (dto) => makeAlarm(dto)),
      find: jest.fn().mockResolvedValue([]),
      findById: jest.fn().mockResolvedValue(makeAlarm()),
      findByIdAndUpdate: jest.fn().mockResolvedValue(makeAlarm()),
    };
    const livekit = {
      ensureRoom: jest.fn().mockResolvedValue(undefined),
      prewarmAgent: jest.fn().mockResolvedValue(undefined),
      ensureAgentReadyForTest: jest.fn().mockResolvedValue(undefined),
      waitForAgentParticipant: jest.fn().mockResolvedValue(undefined),
      generateLivkitToken: jest.fn().mockResolvedValue('lk-token'),
      deleteRoom: jest.fn().mockResolvedValue(undefined),
    };
    const promptService = {
      getPrompt: jest.fn().mockResolvedValue('prompt'),
      getTestCallPrompt: jest.fn().mockResolvedValue('test prompt'),
    };
    const billingService = {
      isEnforcementEnabled: jest.fn().mockReturnValue(false),
      canUseMorningCall: jest.fn().mockResolvedValue(true),
    };
    const userService = {
      getUserDeviceToken: jest.fn().mockResolvedValue({
        deviceToken: 'device-token',
        deviceType: 'android',
      }),
      reserveDailyCallSlot: jest.fn().mockResolvedValue({
        allowed: true,
        count: 1,
        limit: 3,
      }),
      releaseDailyCallSlot: jest.fn().mockResolvedValue(undefined),
      findOne: jest.fn().mockResolvedValue({ name: '사용자' }),
      updateTimeZone: jest.fn().mockResolvedValue(undefined),
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
          'alarm.retryMinutes': '5',
          'alarm.maxDailyRetryCalls': '1',
          'alarm.callAgentCheckTimeoutMs': '1000',
        };
        return values[path];
      }),
    };

    const effectiveAlarmModel = {
      ...alarmModel,
      ...(overrides.alarmModel || {}),
    };
    const effectiveUserService = {
      ...userService,
      ...(overrides.userService || {}),
    };

    const service = new AlarmService(
      overrides.livekit || livekit,
      overrides.apnsService || apnsService,
      overrides.fcmService || fcmService,
      effectiveUserService,
      overrides.promptService || promptService,
      overrides.billingService || billingService,
      effectiveAlarmModel as any,
      overrides.queue || (queue as any),
      overrides.configService || (configService as any),
    );

    return {
      service,
      queue,
      alarmModel: effectiveAlarmModel,
      livekit,
      promptService,
      billingService,
      userService: effectiveUserService,
      fcmService,
      apnsService,
    };
  }

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(fixedNow);
    Settings.now = () => fixedNow;
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    Settings.now = () => Date.now();
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
        jobId: `alarm-id-once-${Date.parse(
          '2026-06-29T00:00:00.000Z',
        )}-prewarm`,
        delay: Date.parse('2026-06-28T23:59:40.000Z') - fixedNow,
      }),
    );
    expect(queue.add).toHaveBeenNthCalledWith(
      2,
      'trigger',
      expect.objectContaining({ action: 'call' }),
      expect.objectContaining({
        jobId: `alarm-id-once-${Date.parse('2026-06-29T00:00:00.000Z')}-call`,
        delay: Date.parse('2026-06-29T00:00:00.000Z') - fixedNow,
      }),
    );
  });

  it('schedules a Toronto alarm from local wall time and stores the queue time in UTC', async () => {
    const now = Date.parse('2026-08-24T00:00:00.000Z');
    jest.spyOn(Date, 'now').mockReturnValue(now);
    Settings.now = () => now;
    const { service, queue, userService } = makeService();
    const expectedCallAt = Date.parse('2026-08-24T11:30:00.000Z');

    await service.createAlarm('user-id', {
      time: '07:30',
      targetDate: null,
      timeZone: 'America/Toronto',
      isOn: true,
      repeatDays: [1],
    } as any);

    expect(queue.add).toHaveBeenCalledWith(
      'trigger',
      expect.objectContaining({ action: 'call', day: 1 }),
      expect.objectContaining({
        jobId: `alarm-id-1-${expectedCallAt}-call`,
        delay: expectedCallAt - now,
      }),
    );
    expect(new Date(expectedCallAt).toISOString()).toBe(
      '2026-08-24T11:30:00.000Z',
    );
    expect(userService.updateTimeZone).toHaveBeenCalledWith(
      'user-id',
      'America/Toronto',
    );
  });

  it('migrates existing alarms and queue jobs to the current IANA time zone', async () => {
    const alarm = makeAlarm({
      timeZone: 'Asia/Seoul',
      retryTrackingDate: '2026-06-28',
      dailyRetryCount: 1,
    });
    const alarmModel = { find: jest.fn().mockResolvedValue([alarm]) };
    const { service, queue, userService } = makeService({ alarmModel });

    await expect(
      service.syncUserTimeZone('user-id', 'America/Los_Angeles'),
    ).resolves.toEqual({
      timeZone: 'America/Los_Angeles',
      updatedAlarms: 1,
    });

    expect(userService.updateTimeZone).toHaveBeenCalledWith(
      'user-id',
      'America/Los_Angeles',
    );
    expect(alarm.timeZone).toBe('America/Los_Angeles');
    expect(alarm.retryTrackingDate).toBe('2026-06-27');
    expect(alarm.dailyRetryCount).toBe(0);
    expect(alarm.save).toHaveBeenCalled();
    expect(queue.add).toHaveBeenCalledWith(
      'trigger',
      expect.objectContaining({ action: 'call' }),
      expect.objectContaining({
        jobId: `alarm-id-once-${Date.parse('2026-06-29T16:00:00.000Z')}-call`,
      }),
    );
  });

  it('rejects invalid time zones before saving or scheduling', async () => {
    const { service, queue, userService } = makeService();

    await expect(
      service.syncUserTimeZone('user-id', 'Mars/Olympus'),
    ).rejects.toThrow('Invalid IANA time zone');
    expect(userService.updateTimeZone).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
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

  it('always uses Hari for new alarms even when a legacy Haru value is sent', async () => {
    const { service } = makeService();
    const baseAlarm = {
      time: '09:00',
      targetDate: '2026-06-29',
      timeZone: 'Asia/Seoul',
      isOn: true,
      repeatDays: [],
    };

    const defaultAlarm = await service.createAlarm('user-id', baseAlarm as any);
    const haruAlarm = await service.createAlarm('user-id', {
      ...baseAlarm,
      role: '하루',
      voice: 'Achird',
    } as any);

    expect(defaultAlarm).toEqual(
      expect.objectContaining({ role: '하리', voice: 'Leda' }),
    );
    expect(haruAlarm).toEqual(
      expect.objectContaining({ role: '하리', voice: 'Leda' }),
    );
  });

  it('defaults retry calls to five minutes with a prewarm job first', async () => {
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
        retryMinutes: 5,
      }),
      expect.objectContaining({
        jobId: `alarm-id-retry-${fixedNow + 300000}-1-prewarm`,
        delay: 280000,
      }),
    );
    expect(queue.add).toHaveBeenNthCalledWith(
      2,
      'trigger',
      expect.objectContaining({
        action: 'call',
        retry: true,
        retryMinutes: 5,
      }),
      expect.objectContaining({
        jobId: `alarm-id-retry-${fixedNow + 300000}-1-call`,
        delay: 300000,
      }),
    );
  });

  it('cancels queued retries after awake and ignores a late no-response outcome', async () => {
    jest.useFakeTimers({ now: fixedNow });
    try {
      const alarm = makeAlarm();
      const retryJob = { id: 'alarm-id-retry-123-1-call', getState: jest.fn().mockResolvedValue('delayed'), remove: jest.fn() };
      const { service, queue } = makeService({ alarmModel: { findById: jest.fn().mockResolvedValue(alarm) } });
      queue.getJobs.mockResolvedValue([retryJob]);
      queue.getJob.mockImplementation(async (id) => id === retryJob.id ? retryJob : null);
      await service.handleCallOutcome({ alarmId: 'alarm-id', callType: 'initial', wakeStatus: 'awake' });
      expect(retryJob.remove).toHaveBeenCalled();
      expect(alarm.lastAwakeAt).toEqual(new Date(fixedNow));

      await expect(service.handleCallOutcome({ alarmId: 'alarm-id', callType: 'initial', wakeStatus: 'no_response' }))
        .resolves.toMatchObject({ action: 'none', wakeStatus: 'awake' });
      await expect(service.scheduleRetryCall('alarm-id')).resolves.toMatchObject({ alreadyAwake: true });
      expect(queue.add).not.toHaveBeenCalled();
    } finally { jest.useRealTimers(); }
  });

  it('does not dispatch an active retry worker once awake is confirmed', async () => {
    const alarm = makeAlarm({ lastAwakeAt: new Date(fixedNow), lastWakeStatus: 'no_response' });
    const { service, livekit, fcmService, userService } = makeService({ alarmModel: { findById: jest.fn().mockResolvedValue(alarm) } });
    await expect(service.prewarmCall(alarm, { callType: 'retry' })).resolves.toMatchObject({ reason: 'already_awake' });
    await expect(service.call(alarm, { callType: 'retry' })).resolves.toMatchObject({ reason: 'already_awake' });
    expect(livekit.prewarmAgent).not.toHaveBeenCalled();
    expect(fcmService.sendCallPush).not.toHaveBeenCalled();
    expect(userService.reserveDailyCallSlot).not.toHaveBeenCalled();
  });

  it('rechecks awake after retry connection preparation and releases the unused call slot', async () => {
    const alarm = makeAlarm();
    const model = { findById: jest.fn().mockResolvedValue(alarm) };
    const { service, livekit, fcmService, userService } = makeService({ alarmModel: model });
    livekit.generateLivkitToken.mockImplementation(async () => {
      alarm.lastAwakeAt = new Date(fixedNow);
      return 'lk-token';
    });
    await expect(service.call(alarm, { callType: 'retry' })).resolves.toMatchObject({ reason: 'already_awake' });
    expect(fcmService.sendCallPush).not.toHaveBeenCalled();
    expect(userService.releaseDailyCallSlot).toHaveBeenCalledWith('user-id', '2026-06-28');
  });

  it('removes a retry scheduled concurrently with an awake report', async () => {
    const alarm = makeAlarm();
    const { service, queue } = makeService({ alarmModel: { findById: jest.fn().mockResolvedValue(alarm) } });
    const jobs = new Map<string, any>();
    queue.getJobs.mockImplementation(async () => Array.from(jobs.values()));
    queue.getJob.mockImplementation(async (id) => jobs.get(id) || null);
    queue.add.mockImplementation(async (_name, _data, options) => {
      alarm.lastAwakeAt = new Date(fixedNow);
      const job = {
        id: options.jobId,
        getState: jest.fn().mockResolvedValue('delayed'),
        remove: jest.fn(async () => { jobs.delete(options.jobId); }),
      };
      jobs.set(options.jobId, job);
      return job;
    });
    await expect(service.scheduleRetryCall('alarm-id')).resolves.toMatchObject({ alreadyAwake: true });
    expect(jobs.size).toBe(0);
  });

  it('allows retries again on the next local day, including Canada', async () => {
    // Same UTC date, but the previous local date in Toronto.
    const alarm = makeAlarm({ timeZone: 'America/Toronto', retryTrackingDate: '2026-06-26', lastAwakeAt: new Date('2026-06-27T01:00:00Z') });
    const { service } = makeService({
      alarmModel: { findById: jest.fn().mockResolvedValue(alarm) },
      userService: { findOne: jest.fn().mockResolvedValue({ timeZone: 'America/Toronto' }) },
    });
    await expect(service.scheduleRetryCall('alarm-id')).resolves.toMatchObject({ success: true });
    expect(alarm.retryTrackingDate).toBe('2026-06-27');
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
      caller: '하리',
      lkUrl: 'wss://livekit.test',
      lkToken: 'lk-token',
      alarmId: 'alarm-id',
    });
  });

  it('blocks the fourth regular or retry call for a user on the same day', async () => {
    const userService = {
      getUserDeviceToken: jest.fn().mockResolvedValue({
        deviceToken: 'device-token',
        deviceType: 'android',
      }),
      reserveDailyCallSlot: jest.fn().mockResolvedValue({
        allowed: false,
        count: 3,
        limit: 3,
      }),
      releaseDailyCallSlot: jest.fn(),
    };
    const { service, livekit, fcmService } = makeService({ userService });

    await expect(
      service.call(makeAlarm(), { callType: 'retry', retryCount: 2 }),
    ).resolves.toEqual({
      sent: false,
      reason: 'daily_call_limit',
      dailyCallLimit: 3,
    });

    expect(livekit.ensureRoom).not.toHaveBeenCalled();
    expect(fcmService.sendCallPush).not.toHaveBeenCalled();
    expect(userService.releaseDailyCallSlot).not.toHaveBeenCalled();
  });

  it('charges daily calls using the canonical user time zone', async () => {
    const userService = {
      findOne: jest.fn().mockResolvedValue({ timeZone: 'America/Los_Angeles' }),
    };
    const { service, userService: effectiveUserService } = makeService({
      userService,
    });

    await service.call(makeAlarm({ timeZone: 'Asia/Seoul' }));

    expect(effectiveUserService.reserveDailyCallSlot).toHaveBeenCalledWith(
      'user-id',
      '2026-06-27',
      3,
    );
  });

  it('reports the remaining regular and retry calls for the user local date', async () => {
    const userService = {
      findOne: jest.fn().mockResolvedValue({
        timeZone: 'Asia/Seoul',
        dailyCallTrackingDate: '2026-06-28',
        dailyCallCount: 2,
      }),
    };
    const { service } = makeService({ userService });

    await expect(service.getDailyCallUsage('user-id')).resolves.toEqual({
      date: '2026-06-28',
      used: 2,
      limit: 3,
      remaining: 1,
    });
  });

  it('reports a fresh call allowance when the tracked date is stale', async () => {
    const userService = {
      findOne: jest.fn().mockResolvedValue({
        timeZone: 'Asia/Seoul',
        dailyCallTrackingDate: '2026-06-27',
        dailyCallCount: 3,
      }),
    };
    const { service } = makeService({ userService });

    await expect(service.getDailyCallUsage('user-id')).resolves.toEqual({
      date: '2026-06-28',
      used: 0,
      limit: 3,
      remaining: 3,
    });
  });

  it('releases the daily call slot when push delivery fails', async () => {
    const fcmService = {
      sendCallPush: jest.fn().mockResolvedValue({
        sent: [],
        failed: [{ status: 400, response: { reason: 'BadDeviceToken' } }],
      }),
      sendWakeFollowupPush: jest.fn(),
    };
    const { service, userService } = makeService({ fcmService });

    await expect(service.call(makeAlarm())).rejects.toThrow(
      'Push failed for alarm alarm-id',
    );
    expect(userService.releaseDailyCallSlot).toHaveBeenCalledWith(
      'user-id',
      '2026-06-28',
    );
  });

  it('schedules one onboarding test push after agent preparation without retry data', async () => {
    const { service, queue, livekit } = makeService();
    const user = {
      _id: 'user-id',
      name: '사용자',
      timeZone: 'Asia/Seoul',
      language: '日本語',
    };

    const result = await service.scheduleOnboardingTestCall(user, {
      wakeIntensity: 'gentle',
      role: '하루',
      delaySeconds: 10,
    });

    expect(livekit.ensureAgentReadyForTest).toHaveBeenCalledWith(
      `${user._id}_onboarding_test_${fixedNow}`,
      'test prompt',
      'Leda',
      user._id,
      'Asia/Seoul',
      undefined,
      'test',
      0,
      '日本語',
    );
    expect(queue.add).toHaveBeenCalledWith(
      'onboarding-test-call',
      {
        action: 'onboarding-test-call',
        userId: user._id,
        roomName: `${user._id}_onboarding_test_${fixedNow}`,
        role: '하리',
      },
      expect.objectContaining({
        delay: 10000,
        removeOnComplete: true,
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        scheduledAt: new Date(fixedNow + 10000).toISOString(),
        callType: 'test',
        retryEnabled: false,
        jobId: `user-id-onboarding-test-${fixedNow + 10000}`,
        roomName: `user-id_onboarding_test_${fixedNow}`,
      }),
    );
  });

  it('cancels queued onboarding tests and deletes their LiveKit rooms', async () => {
    const queuedJob = {
      id: 'user-id-onboarding-test-job',
      data: {
        action: 'onboarding-test-call',
        userId: 'user-id',
        roomName: 'user-id_onboarding_test_room',
      },
      remove: jest.fn().mockResolvedValue(undefined),
    };
    const queue = {
      add: jest.fn(),
      getJob: jest.fn().mockResolvedValue(queuedJob),
      getJobs: jest.fn().mockResolvedValue([queuedJob]),
    };
    const livekit = {
      ensureRoom: jest.fn(),
      prewarmAgent: jest.fn(),
      ensureAgentReadyForTest: jest.fn(),
      waitForAgentParticipant: jest.fn(),
      generateLivkitToken: jest.fn(),
      deleteRoom: jest.fn().mockResolvedValue(undefined),
    };
    const { service } = makeService({ queue, livekit });

    const result = await service.cancelOnboardingTestCall('user-id', {
      jobId: queuedJob.id,
      roomName: queuedJob.data.roomName,
    });

    expect(queuedJob.remove).toHaveBeenCalledTimes(1);
    expect(livekit.deleteRoom).toHaveBeenCalledWith(
      'user-id_onboarding_test_room',
    );
    expect(result).toEqual({
      cancelled: true,
      removedJobs: 1,
      deletedRooms: 1,
    });
  });

  it('sends an onboarding test push once without scheduling a retry', async () => {
    const { service, queue, fcmService } = makeService();

    const result = await service.sendOnboardingTestCall(
      'user-id',
      'test-room',
      '하루',
    );

    expect(fcmService.sendCallPush).toHaveBeenCalledWith('device-token', {
      caller: '하리',
      lkUrl: 'wss://livekit.test',
      lkToken: 'lk-token',
      alarmId: 'onboarding-test',
    });
    expect(queue.add).not.toHaveBeenCalled();
    expect(result).toEqual({
      sent: true,
      callType: 'test',
      retryEnabled: false,
    });
  });

  it('uses the APNs environment stored with the current iOS token', async () => {
    const userService = {
      getUserDeviceToken: jest.fn().mockResolvedValue({
        deviceToken: 'sandbox-voip-token',
        deviceType: 'ios',
        apnsEnvironment: 'sandbox',
      }),
    };
    const { service, apnsService } = makeService({ userService });

    await service.sendOnboardingTestCall('user-id', 'test-room', '하리');

    expect(apnsService.sendVoipPush).toHaveBeenCalledWith(
      'sandbox-voip-token',
      {
        caller: '하리',
        livekitToken: 'lk-token',
        alarmId: 'onboarding-test',
      },
      'sandbox',
    );
  });

  it('reschedules a Thursday 08:00 repeat alarm for the next Thursday after the current Thursday time passed', async () => {
    const now = Date.parse('2026-07-08T23:11:12.101Z');
    jest.spyOn(Date, 'now').mockReturnValue(now);
    Settings.now = () => now;
    const { service, queue } = makeService();
    const expectedCallAt = Date.parse('2026-07-15T23:00:00.000Z');

    await service.createAlarm('user-id', {
      time: '08:00',
      targetDate: null,
      timeZone: 'Asia/Seoul',
      isOn: true,
      repeatDays: [4],
    } as any);

    expect(queue.add).toHaveBeenCalledWith(
      'trigger',
      expect.objectContaining({ action: 'call', day: 4 }),
      expect.objectContaining({
        jobId: `alarm-id-4-${expectedCallAt}-call`,
        delay: expectedCallAt - now,
      }),
    );
    expect(new Date(expectedCallAt).toISOString()).toBe(
      '2026-07-15T23:00:00.000Z',
    );
  });

  it('keeps Wednesday and Thursday 08:00 alarms for the same user in the queue', async () => {
    const now = Date.parse('2026-07-14T00:00:00.000Z');
    jest.spyOn(Date, 'now').mockReturnValue(now);
    Settings.now = () => now;
    const alarmModel = {
      create: jest
        .fn()
        .mockImplementationOnce(async (dto) =>
          makeAlarm({ ...dto, _id: 'wed-id', repeatDays: [3] }),
        )
        .mockImplementationOnce(async (dto) =>
          makeAlarm({ ...dto, _id: 'thu-id', repeatDays: [4] }),
        ),
      findById: jest.fn().mockResolvedValue(makeAlarm()),
    };
    const { service, queue } = makeService({ alarmModel });

    await service.createAlarm('user-id', {
      time: '08:00',
      targetDate: null,
      timeZone: 'Asia/Seoul',
      isOn: true,
      repeatDays: [3],
    } as any);
    await service.createAlarm('user-id', {
      time: '08:00',
      targetDate: null,
      timeZone: 'Asia/Seoul',
      isOn: true,
      repeatDays: [4],
    } as any);

    const jobIds = queue.add.mock.calls.map((call) => call[2].jobId);
    expect(jobIds).toEqual(
      expect.arrayContaining([
        `wed-id-3-${Date.parse('2026-07-14T23:00:00.000Z')}-prewarm`,
        `wed-id-3-${Date.parse('2026-07-14T23:00:00.000Z')}-call`,
        `thu-id-4-${Date.parse('2026-07-15T23:00:00.000Z')}-prewarm`,
        `thu-id-4-${Date.parse('2026-07-15T23:00:00.000Z')}-call`,
      ]),
    );
  });

  it('does not remove jobs for another alarm from the same user when one alarm is updated', async () => {
    const otherJobId = `other-id-3-${Date.parse(
      '2026-07-14T23:00:00.000Z',
    )}-call`;
    const ownJobId = `alarm-id-4-${Date.parse(
      '2026-07-15T23:00:00.000Z',
    )}-call`;
    const ownQueuedJob = {
      id: ownJobId,
      getState: jest.fn().mockResolvedValue('delayed'),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    const queue = {
      add: jest.fn().mockImplementation(async (_name, _data, options) => ({
        id: options.jobId,
        getState: jest.fn().mockResolvedValue('delayed'),
      })),
      getJobs: jest
        .fn()
        .mockResolvedValue([{ id: otherJobId }, { id: ownJobId }]),
      getJob: jest
        .fn()
        .mockImplementation(async (jobId) =>
          jobId === ownJobId ? ownQueuedJob : null,
        ),
    };
    const alarmModel = {
      findById: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(makeAlarm({ userId: 'user-id' })),
      }),
      findByIdAndUpdate: jest
        .fn()
        .mockResolvedValue(makeAlarm({ repeatDays: [4] })),
    };
    const { service } = makeService({ alarmModel, queue });

    await service.updateAlarm('user-id', 'alarm-id', {
      time: '08:00',
      targetDate: null,
      timeZone: 'Asia/Seoul',
      isOn: true,
      repeatDays: [4],
    } as any);

    expect(queue.getJob).not.toHaveBeenCalledWith(otherJobId);
    expect(ownQueuedJob.remove).toHaveBeenCalled();
  });

  it('recovers every active alarm on application bootstrap', async () => {
    const alarmModel = {
      find: jest
        .fn()
        .mockResolvedValue([
          makeAlarm({ _id: 'wed-id', repeatDays: [3], targetDate: null }),
          makeAlarm({ _id: 'thu-id', repeatDays: [4], targetDate: null }),
        ]),
    };
    const { service, queue } = makeService({ alarmModel });

    await service.onModuleInit();

    expect(alarmModel.find).toHaveBeenCalledWith({ isOn: true });
    expect(queue.add).toHaveBeenCalledTimes(4);
    expect(queue.add.mock.calls.map((call) => call[2].jobId)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^wed-id-3-\d+-call$/),
        expect.stringMatching(/^thu-id-4-\d+-call$/),
      ]),
    );
  });

  it('logs a collision when the same job ID already exists', async () => {
    const expectedCallAt = Date.parse('2026-06-29T00:00:00.000Z');
    const existingJob = {
      id: `alarm-id-once-${expectedCallAt}-call`,
      getState: jest.fn().mockResolvedValue('active'),
    };
    const queue = {
      add: jest.fn().mockImplementation(async (_name, _data, options) => ({
        id: options.jobId,
        getState: jest
          .fn()
          .mockResolvedValue(
            options.jobId.endsWith('-call') ? 'active' : 'delayed',
          ),
      })),
      getJob: jest
        .fn()
        .mockImplementation(async (jobId) =>
          jobId === existingJob.id ? existingJob : null,
        ),
      getJobs: jest.fn().mockResolvedValue([]),
    };
    const { service } = makeService({ queue });

    await service.createAlarm('user-id', {
      time: '09:00',
      targetDate: '2026-06-29',
      timeZone: 'Asia/Seoul',
      isOn: true,
      repeatDays: [],
    } as any);

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('[Alarm] job collision detected'),
    );
  });

  it('treats an existing delayed job as an idempotent schedule', async () => {
    const expectedCallAt = Date.parse('2026-06-29T00:00:00.000Z');
    const existingJob = {
      id: `alarm-id-once-${expectedCallAt}-call`,
      getState: jest.fn().mockResolvedValue('delayed'),
    };
    const queue = {
      add: jest.fn().mockImplementation(async (_name, _data, options) => ({
        id: options.jobId,
        getState: jest.fn().mockResolvedValue('delayed'),
      })),
      getJob: jest
        .fn()
        .mockImplementation(async (jobId) =>
          jobId === existingJob.id ? existingJob : null,
        ),
      getJobs: jest.fn().mockResolvedValue([]),
    };
    const { service } = makeService({ queue });

    await service.createAlarm('user-id', {
      time: '09:00',
      targetDate: '2026-06-29',
      timeZone: 'Asia/Seoul',
      isOn: true,
      repeatDays: [],
    } as any);

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('[Alarm] job already scheduled'),
    );
    expect(console.warn).not.toHaveBeenCalledWith(
      expect.stringContaining('[Alarm] job collision detected'),
    );
    expect(queue.add).toHaveBeenCalledTimes(1);
  });

  it('disables orphaned alarms and removes their queued jobs', async () => {
    const orphanJobId = `alarm-id-4-${Date.parse(
      '2026-07-15T23:00:00.000Z',
    )}-call`;
    const queuedJob = {
      id: orphanJobId,
      getState: jest.fn().mockResolvedValue('delayed'),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    const queue = {
      add: jest.fn(),
      getJobs: jest.fn().mockResolvedValue([queuedJob]),
      getJob: jest
        .fn()
        .mockImplementation(async (jobId) =>
          jobId === orphanJobId ? queuedJob : null,
        ),
    };
    const alarmModel = {
      findByIdAndUpdate: jest.fn().mockResolvedValue(makeAlarm()),
    };
    const { service } = makeService({ alarmModel, queue });

    await service.disableOrphanedAlarm('alarm-id', 'missing user');

    expect(alarmModel.findByIdAndUpdate).toHaveBeenCalledWith('alarm-id', {
      isOn: false,
    });
    expect(queuedJob.remove).toHaveBeenCalled();
  });

  it('uses unique job IDs when retry jobs are scheduled more than once', async () => {
    const alarm = makeAlarm();
    const alarmModel = { findById: jest.fn().mockResolvedValue(alarm) };
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
    const { service, queue } = makeService({ alarmModel, configService });

    await service.scheduleRetryCall('alarm-id');
    await service.scheduleRetryCall('alarm-id');

    const retryJobIds = queue.add.mock.calls.map((call) => call[2].jobId);
    expect(new Set(retryJobIds).size).toBe(retryJobIds.length);
    expect(retryJobIds).toEqual(
      expect.arrayContaining([
        `alarm-id-retry-${fixedNow + 120000}-1-call`,
        `alarm-id-retry-${fixedNow + 120000}-2-call`,
      ]),
    );
  });
});
