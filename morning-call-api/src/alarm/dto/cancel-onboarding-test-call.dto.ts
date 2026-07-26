import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CancelOnboardingTestCallDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  jobId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  roomName?: string;
}
