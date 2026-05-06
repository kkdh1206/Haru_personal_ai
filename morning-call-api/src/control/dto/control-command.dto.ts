import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class ControlCommandDto {
  @ApiProperty()
  @IsString()
  message: string;
}
