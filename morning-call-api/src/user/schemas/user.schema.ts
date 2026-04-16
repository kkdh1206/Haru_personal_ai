import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

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

  @Prop({ nullable: true }) // 날씨 기준 위치 (city, province) ex. 포항시, 경상북도
  location: string;

  @Prop({ default: 'korea-top' })
  interest: string; // 뉴스 관심사

  @Prop({ nullable: true })
  deviceToken: string;

  @Prop({ nullable: true })
  deviceType: 'ios' | 'android';

  @Prop({ nullable: true })
  calendarAccessToken: string; // encrypted

  @Prop({ nullable: true })
  calendarRefreshToken: string; // encrypted

  @Prop({ nullable: true })
  customMessage: string;

  @Prop({ default: 'user', enum: ['user', 'admin'] })
  role: string;
}

export const UserSchema = SchemaFactory.createForClass(User);
