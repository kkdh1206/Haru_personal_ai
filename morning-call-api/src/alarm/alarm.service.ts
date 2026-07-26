import {
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Alarm, AlarmDocument } from './schemas/alarm.schema';
import { Model, Types } from 'mongoose';
import { AlarmDto } from './dto/alarm.dto';
import { UserService } from 'src/user/user.service';
import { ApnsService } from 'src/apns/apns.service';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { DateTime } from 'luxon';
import { LivekitService } from 'src/livekit/livekit.service';
import { PromptService } from 'src/prompt/prompt.service';
import { TestCallDto } from './dto/test-call.dto';
import { ConfigService } from '@nestjs/config';
import { ReportCallOutcomeDto } from './dto/report-call-outcome.dto';
import { FcmService } from 'src/fcm/fcm.service';
import { resolveSpeechStyle } from 'src/prompt/speech-style';
import { CancelOnboardingTestCallDto } from './dto/cancel-onboarding-test-call.dto';

const HARU_NAME = '하루';
const HARI_NAME = '하리';
const HARU_VOICE = 'Achird';
const HARI_VOICE = 'Leda';
const DEFAULT_WAKE_INTENSITY = 'gentle';
const DEFAULT_PREWARM_LEAD_SECONDS = 20;
const DEFAULT_RETRY_MINUTES = 2;
const MAX_DAILY_RETRY_CALLS = 2;
const MAX_DAILY_CALLS = 3;
const DEFAULT_CALL_AGENT_CHECK_TIMEOUT_MS = 1000;
const DEFAULT_RETRY_LIMIT_MESSAGE =
  '전화는 여기까지 할게요. 이제 로컬 알람으로 한 번 더 깨워볼게요. 지금 바로 일어나 주세요.';

type AlarmCallType = 'initial' | 'retry';
type AlarmJobAction = 'prewarm' | 'call';
type WakeIntensity = 'gentle' | 'firm';

@Injectable()
export class AlarmService implements OnModuleInit {
  private readonly livekitUrl: string;
  private readonly prewarmLeadMs: number;
  private readonly defaultRetryMinutes: number;
  private readonly maxDailyRetryCalls: number;
  private readonly callAgentCheckTimeoutMs: number;

  constructor(
    private readonly livekit: LivekitService,
    private readonly apnsService: ApnsService,
    private readonly fcmService: FcmService,
    private readonly userService: UserService,
    private readonly promptService: PromptService,
    @InjectModel(Alarm.name) private alarmModel: Model<AlarmDocument>,
    @InjectQueue('alarm') private alarmQueue: Queue,
    private readonly cs: ConfigService,
  ) {
    this.livekitUrl = this.cs.getOrThrow<string>('livekit.websocketUrl');
    this.prewarmLeadMs =
      this.getNonNegativeConfigNumber(
        'alarm.prewarmLeadSeconds',
        DEFAULT_PREWARM_LEAD_SECONDS,
      ) * 1000;
    this.defaultRetryMinutes = this.getPositiveConfigNumber(
      'alarm.retryMinutes',
      DEFAULT_RETRY_MINUTES,
    );
    this.maxDailyRetryCalls = this.getPositiveConfigNumber(
      'alarm.maxDailyRetryCalls',
      MAX_DAILY_RETRY_CALLS,
    );
    this.callAgentCheckTimeoutMs = this.getPositiveConfigNumber(
      'alarm.callAgentCheckTimeoutMs',
      DEFAULT_CALL_AGENT_CHECK_TIMEOUT_MS,
    );
  }

  getMaxDailyRetryCalls() {
    return this.maxDailyRetryCalls;
  }

  async onModuleInit() {
    await this.recoverActiveAlarms();
  }

  private getPositiveConfigNumber(path: string, defaultValue: number) {
    const value = Number(this.cs.get<string | number>(path));
    if (!Number.isFinite(value) || value <= 0) {
      return defaultValue;
    }
    return value;
  }

  private getNonNegativeConfigNumber(path: string, defaultValue: number) {
    const value = Number(this.cs.get<string | number>(path));
    if (!Number.isFinite(value) || value < 0) {
      return defaultValue;
    }
    return value;
  }

  private normalizeAlarmPayload(dto: Partial<AlarmDto | TestCallDto>) {
    const wakeIntensity = this.normalizeWakeIntensity(dto.wakeIntensity);
    const role = dto.role === HARU_NAME ? HARU_NAME : HARI_NAME;

    return {
      ...dto,
      personality: wakeIntensity,
      role,
      voice: role === HARI_NAME ? HARI_VOICE : HARU_VOICE,
      wakeIntensity,
    };
  }

  private normalizeWakeIntensity(value?: string): WakeIntensity {
    return value === 'firm' ? value : DEFAULT_WAKE_INTENSITY;
  }

  private getLocalDateKey(timeZone: string) {
    return DateTime.now()
      .setZone(timeZone || 'Asia/Seoul')
      .toFormat('yyyy-MM-dd');
  }

  private fallbackPrompt(
    language?: string,
    name?: string,
    assistantName = HARI_NAME,
    speechStyle?: string | null,
  ) {
    const displayName = name?.trim() || '사용자';
    const resolvedSpeechStyle = resolveSpeechStyle(language, speechStyle);
    const styleInstruction = `\nSpeech style (${resolvedSpeechStyle.code}):\n${resolvedSpeechStyle.prompt}`;
    if (language?.toLowerCase().includes('english')) {
      return `You are ${assistantName}. Wake ${displayName} up in short, natural English. Start with a wake-up line.${styleInstruction}`;
    }
    if (
      language?.toLowerCase().includes('japanese') ||
      language?.includes('日本') ||
      language?.includes('일본')
    ) {
      return `あなたは${assistantName}です。${displayName}を短く自然な日本語で起こしてください。最初は起床を促す一言から始めます。${styleInstruction}`;
    }

    return `${assistantName}다. ${displayName}를 짧고 자연스럽게 깨워라. 첫 문장은 일어날 시간이라는 말로 시작한다.${styleInstruction}`;
  }

  private async resetDailyRetryStateIfNeeded(alarm: AlarmDocument) {
    const todayKey = this.getLocalDateKey(alarm.timeZone || 'Asia/Seoul');
    if (alarm.retryTrackingDate === todayKey) {
      return todayKey;
    }

    alarm.retryTrackingDate = todayKey;
    alarm.dailyRetryCount = 0;
    alarm.retryLimitNoticeDate = null;
    await alarm.save();
    return todayKey;
  }

  private serializeAlarm<T extends Record<string, any>>(
    alarm: (T & { toObject?: () => Record<string, any> }) | null | undefined,
  ) {
    if (!alarm) {
      return alarm;
    }

    const alarmObject =
      typeof alarm.toObject === 'function' ? alarm.toObject() : alarm;

    const wakeIntensity = this.normalizeWakeIntensity(
      alarmObject.wakeIntensity,
    );
    const role = alarmObject.role === HARU_NAME ? HARU_NAME : HARI_NAME;

    return {
      ...alarmObject,
      role,
      voice: role === HARI_NAME ? HARI_VOICE : HARU_VOICE,
      personality: wakeIntensity,
      wakeIntensity,
    };
  }

  /* ---------- CRUD ---------- */

  async getDailyCallUsage(userId: string) {
    const user = await this.userService.findOne(userId as any);
    if (!user) {
      throw new UnauthorizedException('Unauthorized');
    }

    const date = this.getLocalDateKey(user.timeZone || 'Asia/Seoul');
    const trackedCount =
      user.dailyCallTrackingDate === date
        ? Number(user.dailyCallCount || 0)
        : 0;
    const used = Math.min(Math.max(trackedCount, 0), MAX_DAILY_CALLS);

    return {
      date,
      used,
      limit: MAX_DAILY_CALLS,
      remaining: MAX_DAILY_CALLS - used,
    };
  }

  async createAlarm(userId: string, dto: AlarmDto) {
    const alarm = await this.alarmModel.create({
      userId,
      ...this.normalizeAlarmPayload(dto),
    });
    await this.scheduleAlarm(alarm);
    return this.serializeAlarm(alarm.toObject());
  }

  findAllAlarms(userId: string) {
    return this.alarmModel
      .find({ userId })
      .lean()
      .then((alarms) => alarms.map((alarm) => this.serializeAlarm(alarm)));
  }

  async updateAlarm(userId: string, id: string, dto: AlarmDto) {
    const alarm = await this.alarmModel.findById(id).lean();
    if (alarm.userId.toString() !== userId) {
      throw new UnauthorizedException('Unauthorized');
    }
    const updatedAlarm = await this.alarmModel.findByIdAndUpdate(
      id,
      this.normalizeAlarmPayload(dto),
      {
        new: true,
      },
    );
    await this.clearJobs(id);
    await this.scheduleAlarm(updatedAlarm);
    return this.serializeAlarm(updatedAlarm?.toObject());
  }

  async deleteAlarm(userId: string, id: string) {
    const alarm = await this.alarmModel.findById(id).lean();
    if (alarm.userId.toString() !== userId) {
      throw new UnauthorizedException('Unauthorized');
    }
    await this.clearJobs(id);
    return this.alarmModel.findByIdAndDelete(id);
  }

  /* ---------- BullMQ Job 등록 ---------- */

  private async recoverActiveAlarms() {
    const activeAlarms = await this.alarmModel.find({ isOn: true });
    await Promise.all(activeAlarms.map((alarm) => this.scheduleAlarm(alarm)));
    console.log(
      `[Alarm] recovered active alarms → count=${activeAlarms.length}`,
    );
  }

  private async scheduleAlarm(alarm: AlarmDocument) {
    if (!alarm.isOn) return;

    const tz = alarm.timeZone;
    const [hour, minute] = alarm.time.split(':').map(Number);

    if (alarm.repeatDays.length) {
      // 반복 알람 → 각 요일별 개별 job
      await Promise.all(
        alarm.repeatDays.map((day) => this.scheduleRepeatDay(alarm, day)),
      );
    } else {
      // 1회성 알람
      const next = this.nextOnce(
        hour,
        minute,
        tz,
        alarm.targetDate || undefined,
      );
      await this.scheduleCallJobs({
        baseJobId: `${alarm._id}-once-${next.getTime()}`,
        callAt: next,
        alarm,
        data: {
          alarmId: alarm._id.toString(),
          oneTime: true,
          callType: 'initial',
          retryCount: 0,
        },
      });
    }
  }

  async scheduleNextRepeatAlarm(alarm: AlarmDocument, day: number) {
    return this.scheduleRepeatDay(alarm, day);
  }

  async disableOrphanedAlarm(alarmId: string, reason = 'missing user') {
    await this.alarmModel.findByIdAndUpdate(alarmId, { isOn: false });
    await this.clearJobs(alarmId, reason);
    console.warn(
      `[Alarm] orphaned alarm disabled → ${JSON.stringify({
        alarmId,
        reason,
      })}`,
    );
  }

  private async scheduleRepeatDay(alarm: AlarmDocument, day: number) {
    const [hour, minute] = alarm.time.split(':').map(Number);
    const next = this.nextDayOfWeek(day, hour, minute, alarm.timeZone);
    return this.scheduleCallJobs({
      baseJobId: `${alarm._id}-${day}-${next.getTime()}`,
      callAt: next,
      alarm,
      repeatDay: day,
      data: {
        alarmId: alarm._id.toString(),
        day,
        callType: 'initial',
        retryCount: 0,
      },
    });
  }

  private async scheduleCallJobs({
    baseJobId,
    callAt,
    alarm,
    repeatDay,
    data,
  }: {
    baseJobId: string;
    callAt: Date;
    alarm: AlarmDocument;
    repeatDay?: number;
    data: Record<string, any>;
  }) {
    const prewarmAt = new Date(callAt.getTime() - this.prewarmLeadMs);
    const prewarmDelay = Math.max(0, prewarmAt.getTime() - Date.now());
    const callDelay = Math.max(0, callAt.getTime() - Date.now());

    await Promise.all([
      this.addScheduledJob({
        jobId: `${baseJobId}-prewarm`,
        delay: prewarmDelay,
        scheduledAt: prewarmAt,
        alarm,
        repeatDay,
        data: {
          ...data,
          action: 'prewarm' as AlarmJobAction,
        },
      }),
      this.addScheduledJob({
        jobId: `${baseJobId}-call`,
        delay: callDelay,
        scheduledAt: callAt,
        alarm,
        repeatDay,
        data: {
          ...data,
          action: 'call' as AlarmJobAction,
        },
      }),
    ]);
  }

  private async addScheduledJob({
    jobId,
    delay,
    scheduledAt,
    alarm,
    repeatDay,
    data,
  }: {
    jobId: string;
    delay: number;
    scheduledAt: Date;
    alarm: AlarmDocument;
    repeatDay?: number;
    data: Record<string, any>;
  }) {
    const existingJob = await this.alarmQueue.getJob(jobId);
    const existingJobState = existingJob ? await existingJob.getState() : null;
    const isAlreadyScheduled =
      existingJob &&
      ['delayed', 'waiting', 'waiting-children', 'paused'].includes(
        existingJobState,
      );

    if (isAlreadyScheduled) {
      const logPayload = {
        alarmId: alarm._id.toString(),
        userId: alarm.userId.toString(),
        repeatDay,
        action: data.action,
        localScheduledAt: DateTime.fromJSDate(scheduledAt)
          .setZone(alarm.timeZone || 'Asia/Seoul')
          .toISO(),
        utcScheduledAt: scheduledAt.toISOString(),
        delay,
        jobId,
        returnedJobId: existingJob.id,
        jobState: existingJobState,
        existingJobState,
      };
      console.log(
        `[Alarm] job already scheduled → ${JSON.stringify(logPayload)}`,
      );
      return existingJob;
    }

    const returnedJob = await this.alarmQueue.add('trigger', data, {
      jobId,
      delay,
      removeOnComplete: true,
      removeOnFail: { count: 1000 },
    });
    const jobState = await returnedJob.getState();
    const logPayload = {
      alarmId: alarm._id.toString(),
      userId: alarm.userId.toString(),
      repeatDay,
      action: data.action,
      localScheduledAt: DateTime.fromJSDate(scheduledAt)
        .setZone(alarm.timeZone || 'Asia/Seoul')
        .toISO(),
      utcScheduledAt: scheduledAt.toISOString(),
      delay,
      jobId,
      returnedJobId: returnedJob.id,
      jobState,
      existingJobState,
    };

    if (existingJobState) {
      console.warn(
        `[Alarm] job collision detected → ${JSON.stringify(logPayload)}`,
      );
      return returnedJob;
    }

    console.log(`[Alarm] job scheduled → ${JSON.stringify(logPayload)}`);
    return returnedJob;
  }

  /* ---------- 헬퍼 ---------- */

  // day: 0(Sun)‒6(Sat)
  private nextDayOfWeek(day: number, h: number, m: number, tz: string): Date {
    const now = DateTime.local().setZone(tz);
    const daysDiff = (day - (now.weekday % 7) + 7) % 7; // Luxon Sun=7
    let target = now
      .plus({ days: daysDiff })
      .set({ hour: h, minute: m, second: 0, millisecond: 0 });

    if (target <= now) {
      target = target.plus({ days: 7 });
    }

    return target.toJSDate(); // JS Date (UTC 기반)
  }

  private nextOnce(
    h: number,
    m: number,
    tz: string,
    targetDate?: string,
  ): Date {
    const now = DateTime.local().setZone(tz);
    let target = targetDate
      ? DateTime.fromISO(targetDate, { zone: tz }).set({
          hour: h,
          minute: m,
          second: 0,
          millisecond: 0,
        })
      : now.set({ hour: h, minute: m, second: 0, millisecond: 0 });

    if (target <= now) {
      target = target.plus({ days: 1 });
    }

    return target.toJSDate();
  }

  /** 등록돼 있던 지연·반복 job 전부 제거 */
  private async clearJobs(
    alarmId: string,
    removalReason = 'alarm rescheduled',
  ) {
    const jobIds = [
      `${alarmId}-once`,
      `${alarmId}-once-prewarm`,
      `${alarmId}-once-call`,
      `${alarmId}-retry`,
      `${alarmId}-retry-prewarm`,
      `${alarmId}-retry-call`,
      ...Array.from({ length: 7 }, (_, day) => `${alarmId}-${day}`),
      ...Array.from({ length: 7 }, (_, day) => `${alarmId}-${day}-prewarm`),
      ...Array.from({ length: 7 }, (_, day) => `${alarmId}-${day}-call`),
    ];

    const prefixes = [
      `${alarmId}-once-`,
      `${alarmId}-retry-`,
      ...Array.from({ length: 7 }, (_, day) => `${alarmId}-${day}-`),
    ];

    const queuedJobs = await this.alarmQueue.getJobs(
      [
        'delayed',
        'waiting',
        'paused',
        'prioritized',
        'waiting-children',
        'completed',
        'failed',
      ] as any,
      0,
      -1,
      false,
    );

    queuedJobs.forEach((job) => {
      const id = job.id?.toString();
      if (id && prefixes.some((prefix) => id.startsWith(prefix))) {
        jobIds.push(id);
      }
    });

    await this.removeJobs(Array.from(new Set(jobIds)), removalReason);
  }

  private async removeJobs(
    jobIds: string[],
    removalReason = 'explicit remove',
  ) {
    await Promise.all(
      jobIds.map(async (jobId) => {
        const job = await this.alarmQueue.getJob(jobId);
        if (!job) {
          return;
        }

        const state = await job.getState();
        try {
          await job.remove();
          console.log(
            `[Alarm] removed job → ${JSON.stringify({
              alarmId: jobId.split('-')[0],
              jobId,
              previousState: state,
              removalReason,
            })}`,
          );
        } catch (error) {
          console.warn(
            `[Alarm] failed to remove job → ${JSON.stringify({
              alarmId: jobId.split('-')[0],
              jobId,
              previousState: state,
              removalReason,
              error: error?.message,
            })}`,
          );
        }
      }),
    );
  }

  async findOne(id: Types.ObjectId): Promise<Alarm | null> {
    return this.alarmModel.findById(id).lean();
  }

  async getAlarmWithUser(alarmId: string) {
    const alarm = await this.alarmModel
      .findById(alarmId)
      .populate({
        path: 'user',
        select:
          '_id name email language speechStyle timeZone interest location customMessage',
      })
      .lean();
    return this.serializeAlarm(alarm);
  }

  private async sendRetryLimitPush(alarm: AlarmDocument) {
    const todayKey = this.getLocalDateKey(alarm.timeZone || 'Asia/Seoul');
    if (alarm.retryLimitNoticeDate === todayKey) {
      return {
        success: true,
        skipped: true,
        message: 'Retry limit push already sent today.',
      };
    }

    const deviceToken = await this.userService.getUserDeviceToken(
      alarm.userId.toString(),
    );
    if (!deviceToken?.deviceToken) {
      return {
        success: false,
        skipped: true,
        message: 'Device token not found.',
      };
    }

    const followupToken =
      deviceToken.deviceType === 'android'
        ? deviceToken.deviceToken
        : deviceToken.notificationToken;

    if (!followupToken) {
      alarm.retryLimitNoticeDate = todayKey;
      await alarm.save();
      return {
        success: true,
        skipped: true,
        message: 'Notification token not found.',
      };
    }

    const pushResult =
      deviceToken.deviceType === 'android'
        ? await this.fcmService.sendWakeFollowupPush(
            followupToken,
            DEFAULT_RETRY_LIMIT_MESSAGE,
          )
        : await this.apnsService.sendWakeFollowupPush(
            followupToken,
            DEFAULT_RETRY_LIMIT_MESSAGE,
            deviceToken.apnsEnvironment,
          );

    if (pushResult.sent.length) {
      alarm.retryLimitNoticeDate = todayKey;
      await alarm.save();
    }

    return {
      success: pushResult.sent.length > 0,
      sent: pushResult.sent.length,
      failed: pushResult.failed.length,
    };
  }

  private async buildPromptForAlarm(
    normalizedAlarm: Record<string, any>,
    callType: AlarmCallType,
    retryCount: number,
  ) {
    const alarmId = normalizedAlarm._id.toString();
    const userId = normalizedAlarm.userId.toString();

    try {
      return await this.promptService.getPrompt(alarmId, callType, retryCount);
    } catch (error) {
      console.error(`[Alarm] prompt failed → ${alarmId}`, error);
      const user = await this.userService.findOne(new Types.ObjectId(userId));
      return this.fallbackPrompt(
        user?.language,
        user?.name,
        normalizedAlarm.role,
        user?.speechStyle,
      );
    }
  }

  async prewarmCall(
    alarm,
    options: { callType?: AlarmCallType; retryCount?: number } = {},
  ) {
    const normalizedAlarm = this.serializeAlarm(alarm);
    if (!normalizedAlarm?._id || !normalizedAlarm?.userId) {
      throw new Error('Invalid alarm payload');
    }

    const callType = options.callType || 'initial';
    const retryCount = options.retryCount ?? 0;
    const alarmId = normalizedAlarm._id.toString();
    const userId = normalizedAlarm.userId.toString();
    const prompt = await this.buildPromptForAlarm(
      normalizedAlarm,
      callType,
      retryCount,
    );
    const user = await this.userService.findOne(userId as any);

    await this.livekit.prewarmAgent(
      alarmId,
      prompt,
      normalizedAlarm.voice,
      userId,
      normalizedAlarm.timeZone || 'Asia/Seoul',
      alarmId,
      callType,
      retryCount,
      user?.language || '한국어',
    );
  }

  // user에게 전화걸기 -> 알람 설정한 시간이 되었을때 호출
  async call(
    alarm,
    options: { callType?: AlarmCallType; retryCount?: number } = {},
  ) {
    const normalizedAlarm = this.serializeAlarm(alarm);
    if (!normalizedAlarm?._id || !normalizedAlarm?.userId) {
      throw new Error('Invalid alarm payload');
    }

    // 0. 유저 ID 가져오기
    const alarmId = normalizedAlarm._id.toString();
    const userId = normalizedAlarm.userId.toString();

    // 1. 디바이스 토큰 가져오기
    const deviceToken = await this.userService.getUserDeviceToken(userId);
    if (!deviceToken?.deviceToken) {
      throw new Error(`Device token not found for user ${userId}`);
    }

    const dateKey = this.getLocalDateKey(
      normalizedAlarm.timeZone || 'Asia/Seoul',
    );
    const reservation = await this.userService.reserveDailyCallSlot(
      userId,
      dateKey,
      MAX_DAILY_CALLS,
    );
    if (!reservation.allowed) {
      console.warn(
        `[Alarm] daily call limit reached → user=${userId} date=${dateKey} limit=${MAX_DAILY_CALLS}`,
      );
      return {
        sent: false,
        reason: 'daily_call_limit',
        dailyCallLimit: MAX_DAILY_CALLS,
      };
    }

    try {
      // 2. prewarm 실패가 있어도 정시 푸시가 사용할 방은 보장한다.
      await this.livekit.ensureRoom(alarmId);

      // 3. 정시 푸시를 막지 않도록 에이전트 확인은 짧게만 한다.
      try {
        await this.livekit.waitForAgentParticipant(
          alarmId,
          this.callAgentCheckTimeoutMs,
        );
      } catch (error) {
        console.warn(
          `[Alarm] LiveKit agent not visible before push → ${alarmId}`,
          error,
        );
      }

      // 4. 유저 용 Livekit 토큰 생성
      const room = alarmId;
      const tokenClient = await this.livekit.generateLivkitToken(room, userId);

      // 5. 플랫폼별 푸시 보내기
      const pushResult =
        deviceToken.deviceType === 'android'
          ? await this.fcmService.sendCallPush(deviceToken.deviceToken, {
              caller: normalizedAlarm.role,
              lkUrl: this.livekitUrl,
              lkToken: tokenClient,
              alarmId,
            })
          : await this.apnsService.sendVoipPush(
              deviceToken.deviceToken,
              {
                caller: normalizedAlarm.role,
                livekitToken: tokenClient,
                alarmId,
              },
              deviceToken.apnsEnvironment,
            );
      if (!pushResult.sent.length) {
        const reasons = pushResult.failed
          .map((failure) => {
            const reason = failure.response?.reason || failure.error?.message;
            return [failure.status, reason].filter(Boolean).join(' ');
          })
          .filter(Boolean)
          .join(', ');
        throw new Error(
          `Push failed for alarm ${alarmId}${reasons ? `: ${reasons}` : ''}`,
        );
      }

      return {
        sent: true,
        dailyCallCount: reservation.count,
        dailyCallLimit: MAX_DAILY_CALLS,
      };
    } catch (error) {
      await this.userService.releaseDailyCallSlot(userId, dateKey);
      throw error;
    }
  }

  // 테스트 전화
  async testCall(user, dto: TestCallDto) {
    const normalizedTest = this.normalizeAlarmPayload(dto);

    // 1. 프롬프트 생성
    const prompt = await this.promptService.getTestCallPrompt(
      user,
      normalizedTest.wakeIntensity,
      normalizedTest.role,
    );

    // 2. 에이전트 준비
    await this.livekit.ensureAgentReadyForTest(
      user._id + '_test',
      prompt,
      normalizedTest.voice,
      user._id,
      user.timeZone || 'Asia/Seoul',
      undefined,
      'test',
      0,
      user.language || '한국어',
    );

    // 3. 유저 용 Livekit 토큰 생성
    const room = user._id + '_test';
    const tokenClient = await this.livekit.generateLivkitToken(room, user._id);

    return {
      lkToken: tokenClient,
      lkUrl: this.livekitUrl,
    };
  }

  async scheduleOnboardingTestCall(user, dto: TestCallDto) {
    const normalizedTest = this.normalizeAlarmPayload(dto);
    const delaySeconds = Math.min(Math.max(dto.delaySeconds ?? 10, 5), 30);
    const userId = user._id.toString();
    const deviceToken = await this.userService.getUserDeviceToken(userId);
    if (!deviceToken?.deviceToken) {
      throw new Error(`Device token not found for user ${userId}`);
    }

    const roomName = `${userId}_onboarding_test_${Date.now()}`;
    const prompt = await this.promptService.getTestCallPrompt(
      user,
      normalizedTest.wakeIntensity,
      normalizedTest.role,
    );

    await this.livekit.ensureAgentReadyForTest(
      roomName,
      prompt,
      normalizedTest.voice,
      userId,
      user.timeZone || 'Asia/Seoul',
      undefined,
      'test',
      0,
      user.language || '한국어',
    );

    const scheduledAt = new Date(Date.now() + delaySeconds * 1000);
    const jobId = `${userId}-onboarding-test-${scheduledAt.getTime()}`;
    await this.alarmQueue.add(
      'onboarding-test-call',
      {
        action: 'onboarding-test-call',
        userId,
        roomName,
        role: normalizedTest.role,
      },
      {
        jobId,
        delay: delaySeconds * 1000,
        removeOnComplete: true,
        removeOnFail: { count: 1000 },
      },
    );

    return {
      scheduledAt: scheduledAt.toISOString(),
      delaySeconds,
      callType: 'test',
      retryEnabled: false,
      jobId,
      roomName,
    };
  }

  async cancelOnboardingTestCall(
    userId: string,
    dto: CancelOnboardingTestCallDto,
  ) {
    const queuedJobs = await this.alarmQueue.getJobs(
      [
        'delayed',
        'waiting',
        'active',
        'paused',
        'prioritized',
        'waiting-children',
      ] as any,
      0,
      -1,
      false,
    );
    const jobsById = new Map<string, any>();

    for (const job of queuedJobs) {
      if (
        job.data?.action === 'onboarding-test-call' &&
        job.data?.userId?.toString() === userId
      ) {
        jobsById.set(job.id?.toString(), job);
      }
    }

    if (dto.jobId) {
      const explicitJob = await this.alarmQueue.getJob(dto.jobId);
      if (
        explicitJob?.data?.action === 'onboarding-test-call' &&
        explicitJob.data?.userId?.toString() === userId
      ) {
        jobsById.set(explicitJob.id?.toString(), explicitJob);
      }
    }

    const roomNames = new Set<string>();
    if (dto.roomName && dto.roomName.startsWith(`${userId}_onboarding_test_`)) {
      roomNames.add(dto.roomName);
    }

    let removedJobs = 0;
    for (const job of jobsById.values()) {
      if (job.data?.roomName) {
        roomNames.add(job.data.roomName);
      }

      try {
        await job.remove();
        removedJobs += 1;
      } catch (error) {
        console.warn(
          `[Alarm] onboarding test job removal failed → ${job.id}`,
          error,
        );
      }
    }

    await Promise.all(
      Array.from(roomNames).map((roomName) =>
        this.livekit.deleteRoom(roomName),
      ),
    );

    return {
      cancelled: true,
      removedJobs,
      deletedRooms: roomNames.size,
    };
  }

  async sendOnboardingTestCall(
    userId: string,
    roomName: string,
    role = HARI_NAME,
  ) {
    const deviceToken = await this.userService.getUserDeviceToken(userId);
    if (!deviceToken?.deviceToken) {
      throw new Error(`Device token not found for user ${userId}`);
    }

    const tokenClient = await this.livekit.generateLivkitToken(
      roomName,
      userId,
    );
    const alarmId = 'onboarding-test';
    const pushResult =
      deviceToken.deviceType === 'android'
        ? await this.fcmService.sendCallPush(deviceToken.deviceToken, {
            caller: role,
            lkUrl: this.livekitUrl,
            lkToken: tokenClient,
            alarmId,
          })
        : await this.apnsService.sendVoipPush(
            deviceToken.deviceToken,
            {
              caller: role,
              livekitToken: tokenClient,
              alarmId,
            },
            deviceToken.apnsEnvironment,
          );

    if (!pushResult.sent.length) {
      const reasons = pushResult.failed
        .map((failure) => {
          const reason = failure.response?.reason || failure.error?.message;
          return [failure.status, reason].filter(Boolean).join(' ');
        })
        .filter(Boolean)
        .join(', ');
      throw new Error(
        `Onboarding test push failed for user ${userId}${
          reasons ? `: ${reasons}` : ''
        }`,
      );
    }

    return { sent: true, callType: 'test', retryEnabled: false };
  }

  async scheduleRetryCall(alarmId: string, retryMinutes?: number) {
    const alarm = await this.alarmModel.findById(alarmId);
    if (!alarm) {
      throw new Error(`Alarm not found: ${alarmId}`);
    }

    return this.scheduleRetryCallForAlarm(alarm, retryMinutes);
  }

  private async scheduleRetryCallForAlarm(
    alarm: AlarmDocument,
    retryMinutes?: number,
  ) {
    const normalizedRetryMinutes = Math.min(
      Math.max(retryMinutes ?? this.defaultRetryMinutes, 1),
      30,
    );
    await this.resetDailyRetryStateIfNeeded(alarm);

    if (alarm.dailyRetryCount >= this.maxDailyRetryCalls) {
      return {
        success: false,
        limitReached: true,
        alarmId: alarm._id.toString(),
        retryMinutes: normalizedRetryMinutes,
        message: "You've reached today's retry call limit.",
      };
    }

    const alarmId = alarm._id.toString();
    const retryCount = alarm.dailyRetryCount + 1;
    await this.clearRetryJobs(alarmId);

    const delay = normalizedRetryMinutes * 60 * 1000;
    const scheduledAt = new Date(Date.now() + delay);

    await this.scheduleCallJobs({
      baseJobId: `${alarmId}-retry-${scheduledAt.getTime()}-${retryCount}`,
      callAt: scheduledAt,
      alarm,
      data: {
        alarmId,
        retry: true,
        callType: 'retry',
        retryCount,
        retryMinutes: normalizedRetryMinutes,
      },
    });

    alarm.dailyRetryCount = retryCount;
    alarm.lastRetryScheduledAt = scheduledAt;
    alarm.lastCallType = 'retry';
    await alarm.save();

    return {
      success: true,
      alarmId,
      retryCount,
      retryMinutes: normalizedRetryMinutes,
      scheduledAt: scheduledAt.toISOString(),
    };
  }

  async handleCallOutcome(dto: ReportCallOutcomeDto) {
    const alarm = await this.alarmModel.findById(dto.alarmId);
    if (!alarm) {
      throw new Error(`Alarm not found: ${dto.alarmId}`);
    }

    await this.resetDailyRetryStateIfNeeded(alarm);

    alarm.lastCallType = dto.callType;
    alarm.lastWakeStatus = dto.wakeStatus;
    alarm.lastTriggeredAt = new Date();
    await alarm.save();

    if (dto.wakeStatus === 'awake') {
      await this.clearRetryJobs(dto.alarmId);
      return {
        success: true,
        action: 'none',
        wakeStatus: dto.wakeStatus,
        message: 'User is awake. Retry flow stopped.',
      };
    }

    const retryMinutes = dto.retryMinutes ?? this.defaultRetryMinutes;
    const retryResult = await this.scheduleRetryCallForAlarm(
      alarm,
      retryMinutes,
    );

    if (retryResult.success) {
      return {
        success: true,
        action: 'retry_scheduled',
        wakeStatus: dto.wakeStatus,
        ...retryResult,
      };
    }

    const pushResult = await this.sendRetryLimitPush(alarm);
    return {
      success: true,
      action: 'retry_limit_reached',
      wakeStatus: dto.wakeStatus,
      retryLimit: this.maxDailyRetryCalls,
      message: retryResult.message,
      push: pushResult,
    };
  }

  private async clearRetryJobs(alarmId: string) {
    const legacyJobIds = [
      `${alarmId}-retry`,
      `${alarmId}-retry-prewarm`,
      `${alarmId}-retry-call`,
    ];
    const queuedJobs = await this.alarmQueue.getJobs(
      [
        'delayed',
        'waiting',
        'paused',
        'prioritized',
        'waiting-children',
        'completed',
        'failed',
      ] as any,
      0,
      -1,
      false,
    );
    const retryJobIds = queuedJobs
      .map((job) => job.id?.toString())
      .filter((id) => id?.startsWith(`${alarmId}-retry-`));

    await this.removeJobs(
      Array.from(new Set([...legacyJobIds, ...retryJobIds])),
      'retry rescheduled',
    );
  }
}
