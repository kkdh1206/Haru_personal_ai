import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class SyncTimeZoneDto {
  @ApiProperty({ example: 'America/Los_Angeles' })
  @IsString()
  @IsNotEmpty()
  timeZone: string;
}
