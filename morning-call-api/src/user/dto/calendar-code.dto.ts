import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class CalendarCodeDto {
  @ApiProperty()
  @IsString()
  serverAuthCode: string;
}
