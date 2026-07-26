import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';

export class AlarmDto {
  @ApiProperty({ default: 'gentle' })
  @IsString()
  @IsOptional()
  personality?: string = 'gentle';

  @ApiProperty({ default: 'Leda' })
  @IsString()
  @IsOptional()
  voice?: string = 'Leda';

  @ApiProperty({ required: false, default: '하리' })
  @IsString()
  @IsOptional()
  role?: string = '하리';

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
