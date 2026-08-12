import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type BillingEventDocument = BillingEvent & Document;

@Schema({ timestamps: true, collection: 'billing_events' })
export class BillingEvent {
  @Prop({ required: true, unique: true })
  eventId: string;

  @Prop({ required: true })
  eventType: string;

  @Prop({ default: null })
  appUserId: string | null;

  @Prop({ type: Object, default: {} })
  payload: Record<string, any>;
}

export const BillingEventSchema = SchemaFactory.createForClass(BillingEvent);
