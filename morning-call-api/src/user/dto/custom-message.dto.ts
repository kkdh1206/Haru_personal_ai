import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class CustomMessageDto {
  @ApiProperty()
  @IsString()
  customMessage: string;
}
