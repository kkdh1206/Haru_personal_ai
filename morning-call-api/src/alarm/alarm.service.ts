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

const HARU_NAME = '하루';
const HARU_VOICE = 'Leda';
const DEFAULT_WAKE_INTENSITY = 'gentle';

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

  private serializeAlarm<T extends Record<string, any>>(alarm: T | null) {
    if (!alarm) {
      return alarm;
    }

    const wakeIntensity =
      alarm.wakeIntensity === 'firm' ? 'firm' : DEFAULT_WAKE_INTENSITY;

    return {
      ...alarm,
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
          await this.alarmQueue.add(
            'trigger',
            { alarmId: alarm._id, day },
            {
              jobId: `${alarm._id}-${day}`,
              delay: next.getTime() - Date.now(),
              removeOnComplete: true,
            },
          );
        }),
      );
    } else {
      // 1회성 알람
      const next = this.nextOnce(hour, minute, tz);
      await this.alarmQueue.add(
        'trigger',
        { alarmId: alarm._id, oneTime: true },
        {
          jobId: `${alarm._id}-once`,
          delay: next.getTime() - Date.now(),
          removeOnComplete: true,
        },
      );
    }
  }

  /* ---------- 헬퍼 ---------- */

  // day: 0(Sun)‒6(Sat)
  private nextDayOfWeek(day: number, h: number, m: number, tz: string): Date {
    const now = DateTime.local().setZone(tz);
    const daysDiff = (day - (now.weekday % 7) + 7) % 7 || 7; // Luxon Sun=7
    const target = now
      .plus({ days: daysDiff })
      .set({ hour: h, minute: m, second: 0, millisecond: 0 });
    return target.toJSDate(); // JS Date (UTC 기반)
  }

  private nextOnce(h: number, m: number, tz: string): Date {
    let target = DateTime.local()
      .setZone(tz)
      .set({ hour: h, minute: m, second: 0, millisecond: 0 });
    if (target <= DateTime.local().setZone(tz))
      target = target.plus({ days: 1 });
    return target.toJSDate();
  }

  /** 등록돼 있던 지연·반복 job 전부 제거 */
  private async clearJobs(alarmId: string) {
    // delayed
    const delayed = await this.alarmQueue.getJobs(['delayed']);
    await Promise.all(
      delayed
        .filter((job) => String(job.id).startsWith(alarmId))
        .map((job) => job.remove()),
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

  // user에게 전화걸기 -> 알람 설정한 시간이 되었을때 호출
  async call(alarm) {
    const normalizedAlarm = this.serializeAlarm(alarm);

    // 0. 유저 ID 가져오기
    const userId = normalizedAlarm.userId.toString();

    // 1. 디바이스 토큰 가져오기
    const deviceToken = await this.userService.getUserDeviceToken(userId);

    // 2. 프롬프트 생성
    const prompt = await this.promptService.getPrompt(
      normalizedAlarm._id.toString(),
    );

    // 3. 에이전트 준비
    await this.livekit.readyAgent(
      normalizedAlarm._id.toString(),
      prompt,
      normalizedAlarm.voice,
      userId,
    );

    // 4. 유저 용 Livekit 토큰 생성
    const room = normalizedAlarm._id.toString();
    const tokenClient = await this.livekit.generateLivkitToken(room, userId);

    // 5. APNs 푸시 보내기
    // TODO: android 경우 다른 푸시로 처리
    this.apnsService.sendVoipPush(deviceToken.deviceToken, {
      caller: HARU_NAME,
      livekitToken: tokenClient,
      alarmId: normalizedAlarm._id.toString(),
    });
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
    );

    // 3. 유저 용 Livekit 토큰 생성
    const room = user._id + '_test';
    const tokenClient = await this.livekit.generateLivkitToken(room, user._id);

    return {
      lkToken: tokenClient,
      lkUrl: this.livekitUrl,
    };
  }
}
