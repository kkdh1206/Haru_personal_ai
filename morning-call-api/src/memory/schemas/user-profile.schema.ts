import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type UserProfileDocument = UserProfile & Document;

@Schema({
  timestamps: true,
  collection: 'user_profiles',
})
export class UserProfile {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true })
  userId: Types.ObjectId;

  // 동적 필드를 위한 Map 구조
  // 사용자마다 다른 정보를 자유롭게 저장 가능
  @Prop({ type: Map, of: String, default: {} })
  profile: Map<string, any>;

  @Prop({ default: Date.now })
  updatedAt: Date;
}

export const UserProfileSchema = SchemaFactory.createForClass(UserProfile);

// 인덱스 설정
UserProfileSchema.index({ userId: 1 }, { unique: true });
