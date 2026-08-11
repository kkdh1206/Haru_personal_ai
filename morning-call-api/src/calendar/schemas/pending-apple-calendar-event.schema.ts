import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PendingAppleCalendarEventDocument =
  PendingAppleCalendarEvent & Document;

@Schema({
  timestamps: true,
  collection: 'pending_apple_calendar_events',
})
export class PendingAppleCalendarEvent {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  startTime: string;

  @Prop({ required: true })
  endTime: string;

  @Prop({ default: null })
  description: string | null;

  @Prop({ default: null })
  location: string | null;

  @Prop({ default: false })
  allDay: boolean;

  @Prop({ required: true })
  timeZone: string;

  @Prop({
    enum: ['pending', 'completed', 'failed'],
    default: 'pending',
  })
  status: 'pending' | 'completed' | 'failed';

  @Prop({ default: null })
  deviceEventId: string | null;

  @Prop({ default: null })
  errorMessage: string | null;

  @Prop({ default: null })
  completedAt: Date | null;
}

export const PendingAppleCalendarEventSchema =
  SchemaFactory.createForClass(PendingAppleCalendarEvent);

PendingAppleCalendarEventSchema.index({ userId: 1, status: 1, createdAt: 1 });
PendingAppleCalendarEventSchema.index(
  { updatedAt: 1 },
  { expireAfterSeconds: 60 * 60 * 24 * 30 },
);
