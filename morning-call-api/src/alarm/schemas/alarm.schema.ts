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

  @Prop({ required: true, default: 'Asia/Seoul' })
  timeZone: string; // IANA tz, e.g. 'Asia/Seoul'

  @Prop({ default: true })
  isOn: boolean;

  @Prop({ type: [Number], default: [] })
  repeatDays: number[]; // 0~6 (일~토), 빈 배열이면 1회성

  @Prop({ default: null })
  lastTriggeredAt: Date | null;
}

export const AlarmSchema = SchemaFactory.createForClass(Alarm);

AlarmSchema.virtual('user', {
  ref: 'User',
  localField: 'userId',
  foreignField: '_id',
  justOne: true,
});
