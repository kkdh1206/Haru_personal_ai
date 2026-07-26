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

  @ApiProperty({
    required: false,
    enum: ['sandbox', 'production'],
    description: 'APNs environment that issued the iOS token',
  })
  @IsOptional()
  @IsIn(['sandbox', 'production'])
  apnsEnvironment?: 'sandbox' | 'production';
}
