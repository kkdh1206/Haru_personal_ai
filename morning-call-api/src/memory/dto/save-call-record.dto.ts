import {
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class SaveCallRecordDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  conversationId: string;

  @IsString()
  @IsNotEmpty()
  transcript: string;

  @IsString()
  @IsOptional()
  summary?: string;

  @IsString()
  @IsOptional()
  startedAt?: string;

  @IsString()
  @IsOptional()
  endedAt?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  messageCount?: number;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}
