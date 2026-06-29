import { OnModuleInit } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Alarm, AlarmDocument } from './schemas/alarm.schema';
import { AlarmService } from './alarm.service';

@Processor('alarm')
export class AlarmProcessor extends WorkerHost implements OnModuleInit {
  constructor(
    @InjectModel(Alarm.name) private alarmModel: Model<AlarmDocument>,
    private alarmService: AlarmService,
  ) {
    super();
  }

  onModuleInit() {
    console.log('[Alarm] worker initialized');
  }

  @OnWorkerEvent('active')
  onActive(job: Job) {
    console.log(`[Alarm] worker active → ${job.id}`);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    console.log(`[Alarm] worker completed → ${job.id}`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job | undefined, error: Error) {
    console.error(`[Alarm] worker failed → ${job?.id ?? 'unknown'}`, error);
  }

  async process(
    job: Job<{
      alarmId: string;
      oneTime?: boolean;
      day?: number;
      retry?: boolean;
      retryMinutes?: number;
      callType?: 'initial' | 'retry';
      retryCount?: number;
      action?: 'prewarm' | 'call';
    }>,
  ): Promise<void> {
    const { alarmId, oneTime, day, retry, callType, retryCount, action } =
      job.data;
    const alarm = await this.alarmModel.findById(alarmId);
    if (!alarm) return;
    if (!retry && !alarm.isOn) return;

    const isLegacyJob = !action;
    const jobAction = action || 'call';

    console.log(
      `🔔 Alarm ${jobAction}${retry ? ' [retry]' : ''} → ${alarmId} (${alarm.time})`,
    );

    try {
      if (jobAction === 'prewarm') {
        await this.alarmService.prewarmCall(alarm, {
          callType: callType || (retry ? 'retry' : 'initial'),
          retryCount: retryCount ?? 0,
        });
        return;
      } else {
        if (isLegacyJob) {
          try {
            await this.alarmService.prewarmCall(alarm, {
              callType: callType || (retry ? 'retry' : 'initial'),
              retryCount: retryCount ?? 0,
            });
          } catch (error) {
            console.error(`[Alarm] legacy prewarm failed → ${alarmId}`, error);
          }
        }
        await this.alarmService.call(alarm, {
          callType: callType || (retry ? 'retry' : 'initial'),
          retryCount: retryCount ?? 0,
        });
      }
    } catch (error) {
      console.error(`[Alarm] ${jobAction} failed → ${alarmId}`, error);
      if (jobAction === 'prewarm') {
        return;
      }
    }

    // 1회성이면 끄기
    if (oneTime) alarm.isOn = false;

    alarm.lastTriggeredAt = new Date();
    await alarm.save();

    // 반복 알람이면 다음 주기 재등록
    if (!retry && !oneTime && typeof day === 'number') {
      await this.alarmService.scheduleNextRepeatAlarm(alarm, day);
    }
  }
}
