import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateCalendarEventDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  userId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({
    description: 'ISO 8601 datetime or YYYY-MM-DD for all-day events',
  })
  @IsString()
  @IsNotEmpty()
  startTime: string;

  @ApiProperty({
    required: false,
    description: 'ISO 8601 datetime or YYYY-MM-DD for all-day events',
  })
  @IsString()
  @IsOptional()
  endTime?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  location?: string;

  @ApiProperty({ required: false, default: false })
  @IsBoolean()
  @IsOptional()
  allDay?: boolean = false;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  timeZone?: string;
}
