import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AlarmDocument = Alarm & Document;

@Schema({
  timestamps: true,
  collection: 'alarms',
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
})
export class Alarm {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ default: 'bright' })
  personality: string;

  @Prop({ default: 'Leda' })
  voice: string;

  @Prop({ required: true, default: '하루' })
  role: string;

  @Prop({ default: 'gentle' })
  wakeIntensity: 'gentle' | 'firm';

  @Prop({ required: true })
  time: string; // 'HH:mm' 형식

  @Prop({ default: null })
  targetDate?: string | null; // 'YYYY-MM-DD' 형식의 1회성 목표 날짜

  @Prop({ required: true, default: 'Asia/Seoul' })
  timeZone: string; // IANA tz, e.g. 'Asia/Seoul'

  @Prop({ default: true })
  isOn: boolean;

  @Prop({ type: [Number], default: [] })
  repeatDays: number[]; // 0~6 (일~토), 빈 배열이면 1회성

  @Prop({ default: null })
  lastTriggeredAt: Date | null;

  @Prop({ default: 0 })
  dailyRetryCount: number;

  @Prop({ default: null })
  retryTrackingDate: string | null;

  @Prop({ default: 'initial', enum: ['initial', 'retry'] })
  lastCallType: 'initial' | 'retry';

  @Prop({ default: null })
  lastWakeStatus:
    | 'awake'
    | 'not_awake'
    | 'retry_requested'
    | 'no_response'
    | 'rejected'
    | null;

  // Independent of lastWakeStatus: a delayed negative outcome cannot undo it.
  @Prop({ default: null })
  lastAwakeAt: Date | null;

  @Prop({ default: null })
  lastRetryScheduledAt: Date | null;

  @Prop({ default: null })
  retryLimitNoticeDate: string | null;
}

export const AlarmSchema = SchemaFactory.createForClass(Alarm);

AlarmSchema.virtual('user', {
  ref: 'User',
  localField: 'userId',
  foreignField: '_id',
  justOne: true,
});
