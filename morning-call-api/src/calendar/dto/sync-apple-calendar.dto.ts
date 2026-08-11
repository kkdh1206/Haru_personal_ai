import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class AppleCalendarEventDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  externalId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  startTime: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  endTime: string;

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
  allDay?: boolean;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  calendarTitle?: string;
}

export class SyncAppleCalendarDto {
  @ApiProperty({ type: [AppleCalendarEventDto] })
  @IsArray()
  @ArrayMaxSize(2000)
  events: AppleCalendarEventDto[];
}
