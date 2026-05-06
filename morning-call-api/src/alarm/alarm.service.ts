import { Injectable, UnauthorizedException } from '@nestjs/common';
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

const HARU_NAME = '하루';
const HARU_VOICE = 'Leda';
const DEFAULT_WAKE_INTENSITY = 'gentle';
const DEFAULT_RETRY_MINUTES = 3;
const MAX_DAILY_RETRY_CALLS = 3;
const DEFAULT_RETRY_LIMIT_MESSAGE =
  "전화를 여러 번 드렸는데 연결이 잘 안 돼서 메시지를 남겨요. 오늘 하루도 무사히 잘 보내길 바랄게요.";

@Injectable()
export class AlarmService {
  private readonly livekitUrl: string;

  constructor(
    private readonly livekit: LivekitService,
    private readonly apnsService: ApnsService,
    private readonly userService: UserService,
    private readonly promptService: PromptService,
    @InjectModel(Alarm.name) private alarmModel: Model<AlarmDocument>,
    @InjectQueue('alarm') private alarmQueue: Queue,
    private readonly cs: ConfigService,
  ) {
    this.livekitUrl = this.cs.getOrThrow<string>('livekit.websocketUrl');
  }

  private normalizeAlarmPayload(dto: Partial<AlarmDto | TestCallDto>) {
    const wakeIntensity =
      dto.wakeIntensity === 'firm' ? 'firm' : DEFAULT_WAKE_INTENSITY;

    return {
      ...dto,
      personality: wakeIntensity,
      role: HARU_NAME,
      voice: HARU_VOICE,
      wakeIntensity,
    };
  }

  private getLocalDateKey(timeZone: string) {
    return DateTime.now().setZone(timeZone || 'Asia/Seoul').toFormat('yyyy-MM-dd');
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

    const wakeIntensity =
      alarmObject.wakeIntensity === 'firm' ? 'firm' : DEFAULT_WAKE_INTENSITY;

    return {
      ...alarmObject,
      role: HARU_NAME,
      voice: HARU_VOICE,
      personality: wakeIntensity,
      wakeIntensity,
    };
  }

  /* ---------- CRUD ---------- */

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

  private async scheduleAlarm(alarm: AlarmDocument) {
    if (!alarm.isOn) return;

    const tz = alarm.timeZone;
    const [hour, minute] = alarm.time.split(':').map(Number);

    if (alarm.repeatDays.length) {
      // 반복 알람 → 각 요일별 개별 job
      await Promise.all(
        alarm.repeatDays.map(async (day) => {
          const next = this.nextDayOfWeek(day, hour, minute, tz);
          const delay = next.getTime() - Date.now();
          const job = await this.alarmQueue.add(
            'trigger',
            { alarmId: alarm._id, day, callType: 'initial', retryCount: 0 },
            {
              jobId: `${alarm._id}-${day}`,
              delay,
              removeOnComplete: true,
            },
          );
          const state = await job.getState();
          console.log(
            `[Alarm] scheduled → ${job.id} at ${next.toISOString()} delay=${delay} state=${state}`,
          );
        }),
      );
    } else {
      // 1회성 알람
      const next = this.nextOnce(hour, minute, tz, alarm.targetDate || undefined);
      const delay = next.getTime() - Date.now();
      const job = await this.alarmQueue.add(
        'trigger',
        { alarmId: alarm._id, oneTime: true, callType: 'initial', retryCount: 0 },
        {
          jobId: `${alarm._id}-once`,
          delay,
          removeOnComplete: true,
        },
      );
      const state = await job.getState();
      console.log(
        `[Alarm] scheduled → ${job.id} at ${next.toISOString()} delay=${delay} state=${state}`,
      );
    }
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

  private nextOnce(h: number, m: number, tz: string, targetDate?: string): Date {
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
  private async clearJobs(alarmId: string) {
    const jobIds = [
      `${alarmId}-once`,
      `${alarmId}-retry`,
      ...Array.from({ length: 7 }, (_, day) => `${alarmId}-${day}`),
    ];

    await Promise.all(
      jobIds.map(async (jobId) => {
        const job = await this.alarmQueue.getJob(jobId);
        if (!job) {
          return;
        }

        const state = await job.getState();
        await job.remove();
        console.log(`[Alarm] removed job → ${jobId} state=${state}`);
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
          '_id name email language timeZone interest location customMessage',
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

    const pushResult = await this.apnsService.sendWakeFollowupPush(
      deviceToken.deviceToken,
      DEFAULT_RETRY_LIMIT_MESSAGE,
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

  // user에게 전화걸기 -> 알람 설정한 시간이 되었을때 호출
  async call(
    alarm,
    options: { callType?: 'initial' | 'retry'; retryCount?: number } = {},
  ) {
    const normalizedAlarm = this.serializeAlarm(alarm);
    if (!normalizedAlarm?._id || !normalizedAlarm?.userId) {
      throw new Error('Invalid alarm payload');
    }

    const callType = options.callType || 'initial';
    const retryCount = options.retryCount ?? 0;

    // 0. 유저 ID 가져오기
    const alarmId = normalizedAlarm._id.toString();
    const userId = normalizedAlarm.userId.toString();

    // 1. 디바이스 토큰 가져오기
    const deviceToken = await this.userService.getUserDeviceToken(userId);
    if (!deviceToken?.deviceToken) {
      throw new Error(`Device token not found for user ${userId}`);
    }

    // 2. 프롬프트 생성
    let prompt: string;
    try {
      prompt = await this.promptService.getPrompt(alarmId, callType, retryCount);
    } catch (error) {
      console.error(`[Alarm] prompt failed → ${alarmId}`, error);
      prompt = `${HARU_NAME}다. 사용자를 짧고 자연스럽게 깨워라. 첫 문장은 일어날 시간이라는 말로 시작한다.`;
    }

    // 3. 에이전트 준비
    try {
      await this.livekit.readyAgent(
        alarmId,
        prompt,
        normalizedAlarm.voice,
        userId,
        normalizedAlarm.timeZone || 'Asia/Seoul',
        alarmId,
        callType,
        retryCount,
      );
    } catch (error) {
      console.error(`[Alarm] LiveKit agent failed → ${alarmId}`, error);
    }

    // 4. 유저 용 Livekit 토큰 생성
    const room = alarmId;
    const tokenClient = await this.livekit.generateLivkitToken(room, userId);

    // 5. APNs 푸시 보내기
    // TODO: android 경우 다른 푸시로 처리
    const pushResult = await this.apnsService.sendVoipPush(
      deviceToken.deviceToken,
      {
        caller: HARU_NAME,
        livekitToken: tokenClient,
        alarmId,
      },
    );
    if (!pushResult.sent.length) {
      throw new Error(`APNs push failed for alarm ${alarmId}`);
    }
  }

  // 테스트 전화
  async testCall(user, dto: TestCallDto) {
    const normalizedTest = this.normalizeAlarmPayload(dto);

    // 1. 프롬프트 생성
    const prompt = await this.promptService.getTestCallPrompt(
      user,
      normalizedTest.wakeIntensity,
    );

    // 2. 에이전트 준비
    await this.livekit.readyAgent(
      user._id + '_test',
      prompt,
      normalizedTest.voice,
      user._id,
      user.timeZone || 'Asia/Seoul',
    );

    // 3. 유저 용 Livekit 토큰 생성
    const room = user._id + '_test';
    const tokenClient = await this.livekit.generateLivkitToken(room, user._id);

    return {
      lkToken: tokenClient,
      lkUrl: this.livekitUrl,
    };
  }

  async scheduleRetryCall(alarmId: string, retryMinutes = 3) {
    const alarm = await this.alarmModel.findById(alarmId);
    if (!alarm) {
      throw new Error(`Alarm not found: ${alarmId}`);
    }

    return this.scheduleRetryCallForAlarm(alarm, retryMinutes);
  }

  private async scheduleRetryCallForAlarm(
    alarm: AlarmDocument,
    retryMinutes = DEFAULT_RETRY_MINUTES,
  ) {
    const normalizedRetryMinutes = Math.min(Math.max(retryMinutes, 1), 30);
    await this.resetDailyRetryStateIfNeeded(alarm);

    if (alarm.dailyRetryCount >= MAX_DAILY_RETRY_CALLS) {
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
    const existingRetryJob = await this.alarmQueue.getJob(`${alarmId}-retry`);
    if (existingRetryJob) {
      await existingRetryJob.remove();
    }

    const delay = normalizedRetryMinutes * 60 * 1000;
    const scheduledAt = new Date(Date.now() + delay);

    const job = await this.alarmQueue.add(
      'trigger',
      {
        alarmId,
        retry: true,
        callType: 'retry',
        retryCount,
        retryMinutes: normalizedRetryMinutes,
      },
      {
        jobId: `${alarmId}-retry`,
        delay,
        removeOnComplete: true,
      },
    );
    const state = await job.getState();
    console.log(
      `[Alarm] retry scheduled → ${job.id} at ${scheduledAt.toISOString()} delay=${delay} state=${state}`,
    );

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
      const existingRetryJob = await this.alarmQueue.getJob(`${dto.alarmId}-retry`);
      if (existingRetryJob) {
        await existingRetryJob.remove();
      }
      return {
        success: true,
        action: 'none',
        wakeStatus: dto.wakeStatus,
        message: 'User is awake. Retry flow stopped.',
      };
    }

    const retryMinutes = dto.retryMinutes ?? DEFAULT_RETRY_MINUTES;
    const retryResult = await this.scheduleRetryCallForAlarm(alarm, retryMinutes);

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
      retryLimit: MAX_DAILY_RETRY_CALLS,
      message: retryResult.message,
      push: pushResult,
    };
  }
}
