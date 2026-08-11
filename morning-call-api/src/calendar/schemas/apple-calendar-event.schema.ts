import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AppleCalendarEventDocument = AppleCalendarEvent & Document;

@Schema({
  timestamps: true,
  collection: 'apple_calendar_events',
})
export class AppleCalendarEvent {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  externalId: string;

  @Prop({ required: true })
  summary: string;

  @Prop({ default: null })
  description: string | null;

  @Prop({ required: true })
  start: string;

  @Prop({ required: true })
  end: string;

  @Prop({ required: true })
  startAt: Date;

  @Prop({ required: true })
  endAt: Date;

  @Prop({ default: null })
  location: string | null;

  @Prop({ default: false })
  allDay: boolean;

  @Prop({ default: null })
  calendarTitle: string | null;
}

export const AppleCalendarEventSchema =
  SchemaFactory.createForClass(AppleCalendarEvent);

AppleCalendarEventSchema.index({ userId: 1, externalId: 1 }, { unique: true });
AppleCalendarEventSchema.index({ userId: 1, startAt: 1, endAt: 1 });
AppleCalendarEventSchema.index(
  { updatedAt: 1 },
  { expireAfterSeconds: 60 * 60 * 24 * 60 },
);
