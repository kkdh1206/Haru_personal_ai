import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class TestCallDto {
  @ApiProperty({ default: 'gentle' })
  @IsString()
  @IsOptional()
  personality?: string = 'gentle';

  @ApiProperty({ default: 'Leda' })
  @IsString()
  @IsOptional()
  voice?: string = 'Leda';

  @ApiProperty({ required: false, default: '하루' })
  @IsString()
  @IsOptional()
  role?: string = '하루';

  @ApiProperty({ required: false, default: 'gentle' })
  @IsString()
  @IsOptional()
  wakeIntensity?: 'gentle' | 'firm' = 'gentle';
}
