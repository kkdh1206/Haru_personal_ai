import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateAssistantTaskDto {
  @ApiProperty({ maxLength: 500 })
  @IsString()
  @MaxLength(500)
  title: string;

  @ApiProperty({ required: false, enum: ['high', 'normal'] })
  @IsOptional()
  @IsIn(['high', 'normal'])
  priority?: 'high' | 'normal';

  @ApiProperty({
    required: false,
    nullable: true,
    description: 'ISO 8601 date/time. Send null to leave the task undated.',
  })
  @IsOptional()
  dueAt?: string | null;
}
