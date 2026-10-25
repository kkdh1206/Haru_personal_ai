import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class AssistantChatHistoryDto {
  @ApiProperty({ enum: ['user', 'assistant'] })
  @IsIn(['user', 'assistant'])
  role: 'user' | 'assistant';

  @ApiProperty({ maxLength: 4000 })
  @IsString()
  @MaxLength(4000)
  content: string;
}

export class AssistantChatDto {
  @ApiProperty({ maxLength: 4000 })
  @IsString()
  @MaxLength(4000)
  message: string;

  @ApiProperty({ required: false, type: [AssistantChatHistoryDto] })
  @IsOptional()
  @IsArray()
  history?: AssistantChatHistoryDto[];
}
