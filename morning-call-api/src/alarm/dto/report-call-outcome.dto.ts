import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsMongoId, IsOptional, Max, Min } from 'class-validator';

export class ReportCallOutcomeDto {
  @ApiProperty({ required: true })
  @IsMongoId()
  alarmId: string;

  @ApiProperty({ enum: ['initial', 'retry'], default: 'initial' })
  @IsIn(['initial', 'retry'])
  callType: 'initial' | 'retry';

  @ApiProperty({ required: false, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  retryCount?: number = 0;

  @ApiProperty({
    enum: ['awake', 'not_awake', 'retry_requested', 'no_response', 'rejected'],
  })
  @IsIn(['awake', 'not_awake', 'retry_requested', 'no_response', 'rejected'])
  wakeStatus:
    | 'awake'
    | 'not_awake'
    | 'retry_requested'
    | 'no_response'
    | 'rejected';

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  hadUserResponse?: boolean = false;

  @ApiProperty({ required: false, default: 3, minimum: 1, maximum: 30 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  retryMinutes?: number = 3;
}
