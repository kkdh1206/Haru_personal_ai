import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { SPEECH_STYLE_CODES } from 'src/prompt/speech-style';

export type UserDocument = User & Document;

@Schema({
  timestamps: true,
  collection: 'users',
})
export class User {
  @Prop({ required: true, unique: true, nullable: true })
  firebaseUid: string;

  @Prop({ required: true, unique: true, nullable: true })
  email: string;

  @Prop({ nullable: true })
  name: string;

  @Prop({ default: 'Asia/Seoul' })
  timeZone: string;

  @Prop({ default: 'false' })
  isSubscribed: boolean;

  @Prop({ default: '한국어' })
  language: string;

  @Prop({ default: null, enum: SPEECH_STYLE_CODES })
  speechStyle: string | null;

  @Prop({ nullable: true }) // 날씨 기준 위치 (city, province) ex. 포항시, 경상북도
  location: string;

  @Prop({ default: 'korea-top' })
  interest: string; // 뉴스 관심사

  @Prop({ nullable: true })
  deviceToken: string;

  @Prop({ nullable: true })
  notificationToken: string;

  @Prop({ nullable: true })
  deviceType: 'ios' | 'android';

  @Prop({ nullable: true, enum: ['sandbox', 'production'] })
  apnsEnvironment: 'sandbox' | 'production';

  @Prop({ nullable: true })
  calendarAccessToken: string; // encrypted

  @Prop({ nullable: true })
  calendarRefreshToken: string; // encrypted

  @Prop({ nullable: true })
  customMessage: string;

  @Prop({ default: null })
  dailyCallTrackingDate: string | null;

  @Prop({ default: 0, min: 0 })
  dailyCallCount: number;

  @Prop({ default: 'user', enum: ['user', 'admin'] })
  role: string;
}

export const UserSchema = SchemaFactory.createForClass(User);
