import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class DeviceTokenDto {
  @ApiProperty()
  @IsString()
  deviceToken: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notificationToken?: string;

  @ApiProperty({ required: false, enum: ['ios', 'android'], default: 'ios' })
  @IsOptional()
  @IsIn(['ios', 'android'])
  deviceType?: 'ios' | 'android';
}
