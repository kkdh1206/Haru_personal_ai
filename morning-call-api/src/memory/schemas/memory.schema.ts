import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type MemoryDocument = Memory & Document;
export type MemoryType =
  | 'legacy_message'
  | 'call_record'
  | 'long_term_memory'
  | 'reminder';

@Schema({
  timestamps: true,
  collection: 'memories',
})
export class Memory {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  conversationId: string; // 세션/방 ID (예: LiveKit roomName)

  @Prop({
    required: true,
    enum: ['legacy_message', 'call_record', 'long_term_memory', 'reminder'],
    default: 'legacy_message',
  })
  memoryType: MemoryType;

  @Prop({ required: true, enum: ['user', 'assistant', 'system'] })
  role: 'user' | 'assistant' | 'system';

  @Prop({ required: true })
  content: string; // 대화 내용

  @Prop({ type: String, default: null })
  summary: string | null; // Gemini가 생성한 요약본

  @Prop({ type: Object, default: {} })
  metadata: {
    importantData?: any; // Gemini가 추출한 중요 정보
    tags?: string[]; // 검색용 태그
    [key: string]: any; // 추가 메타데이터
  };

  @Prop({ type: String, default: null })
  chromaId: string | null; // ChromaDB에 저장된 ID

  @Prop({ type: String, default: null })
  normalizedContent: string | null;

  @Prop({ default: Date.now })
  timestamp: Date;
}

export const MemorySchema = SchemaFactory.createForClass(Memory);

// 인덱스 설정
MemorySchema.index({ userId: 1, memoryType: 1, timestamp: -1 });
MemorySchema.index({ conversationId: 1, timestamp: 1 });
MemorySchema.index({ userId: 1, conversationId: 1, memoryType: 1 });
MemorySchema.index({ userId: 1, memoryType: 1, normalizedContent: 1 });
