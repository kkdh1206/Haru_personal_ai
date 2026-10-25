import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateAssistantTaskDto {
  @ApiProperty({ required: false, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string;

  @ApiProperty({ required: false, enum: ['high', 'normal'] })
  @IsOptional()
  @IsIn(['high', 'normal'])
  priority?: 'high' | 'normal';

  @ApiProperty({
    required: false,
    nullable: true,
    description: 'ISO 8601 date/time. Send null to clear the due date.',
  })
  @IsOptional()
  dueAt?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  completed?: boolean;
}
