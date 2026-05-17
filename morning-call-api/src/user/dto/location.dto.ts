import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class LocationDto {
  @ApiProperty()
  @IsString()
  location: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  timeZone?: string;
}
