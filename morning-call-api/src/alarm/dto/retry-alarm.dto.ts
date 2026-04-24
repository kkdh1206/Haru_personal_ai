import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsMongoId, IsOptional, Max, Min } from 'class-validator';

export class RetryAlarmDto {
  @ApiProperty({ required: true })
  @IsMongoId()
  alarmId: string;

  @ApiProperty({ required: false, default: 3, minimum: 1, maximum: 30 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  retryMinutes?: number = 3;
}
