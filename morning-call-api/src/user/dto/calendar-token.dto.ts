import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class CalendarTokenDto {
  @ApiProperty()
  @IsString()
  calendarAccessToken: string;

  @ApiProperty()
  @IsString()
  calendarRefreshToken: string;
}
