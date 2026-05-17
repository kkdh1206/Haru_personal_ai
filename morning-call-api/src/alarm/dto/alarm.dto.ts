import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';

export class AlarmDto {
  @ApiProperty({ default: 'gentle' })
  @IsString()
  @IsOptional()
  personality?: string = 'gentle';

  @ApiProperty({ default: 'Rasalgethi' })
  @IsString()
  @IsOptional()
  voice?: string = 'Rasalgethi';

  @ApiProperty({ required: false, default: '하루' })
  @IsString()
  @IsOptional()
  role?: string = '하루';

  @ApiProperty({ required: false, default: 'gentle' })
  @IsString()
  @IsOptional()
  wakeIntensity?: 'gentle' | 'firm' = 'gentle';

  @ApiProperty({ required: true, default: '09:00' })
  @IsString()
  time: string;

  @ApiProperty({ required: false, default: null })
  @IsString()
  @IsOptional()
  targetDate?: string;

  @ApiProperty({ required: true, default: 'Asia/Seoul' })
  @IsString()
  timeZone: string;

  @ApiProperty({ type: Boolean, default: true })
  @IsBoolean()
  isOn: boolean;

  @ApiProperty({ type: [Number], default: [] })
  @IsArray()
  repeatDays: number[];
}
