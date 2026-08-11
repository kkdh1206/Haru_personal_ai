import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CompleteAppleCalendarEventDto {
  @ApiProperty()
  @IsBoolean()
  success: boolean;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  eventIdentifier?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  errorMessage?: string;
}
