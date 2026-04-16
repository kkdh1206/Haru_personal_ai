import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Alarm, AlarmDocument } from './schemas/alarm.schema';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { AlarmService } from './alarm.service';
import { DateTime } from 'luxon';

@Processor('alarm')
export class AlarmProcessor extends WorkerHost {
  constructor(
    @InjectModel(Alarm.name) private alarmModel: Model<AlarmDocument>,
    @InjectQueue('alarm') private alarmQueue: Queue,
    private alarmService: AlarmService,
  ) {
    super();
  }

  async process(
    job: Job<{ alarmId: string; oneTime?: boolean; day?: number }>,
  ): Promise<void> {
    const { alarmId, oneTime, day } = job.data;
    const alarm = await this.alarmModel.findById(alarmId);
    if (!alarm || !alarm.isOn) return;

    /* 실제 알람 액션 (푸시·전화·SMS 등) */
    console.log(`🔔 Alarm fired → ${alarmId} (${alarm.time})`);
    this.alarmService.call(alarm);

    // 1회성이면 끄기
    if (oneTime) alarm.isOn = false;

    alarm.lastTriggeredAt = new Date();
    await alarm.save();

    // 반복 알람이면 다음 주기 재등록
    if (!oneTime && typeof day === 'number') {
      const [h, m] = alarm.time.split(':').map(Number);

      const next = DateTime.local()
        .setZone(alarm.timeZone) // ex) 'Asia/Seoul'
        .plus({ weeks: 1 })
        .set({ hour: h, minute: m, second: 0, millisecond: 0 });

      await this.alarmQueue.add(
        'trigger',
        { alarmId, day },
        {
          jobId: `${alarmId}-${day}`,
          delay: next.toUTC().toMillis() - Date.now(),
          removeOnComplete: true,
        },
      );
    }
  }
}
