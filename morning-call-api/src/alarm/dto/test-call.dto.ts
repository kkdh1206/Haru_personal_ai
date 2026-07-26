import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class TestCallDto {
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

  @ApiProperty({ required: false, default: 10, minimum: 5, maximum: 30 })
  @IsInt()
  @Min(5)
  @Max(30)
  @IsOptional()
  delaySeconds?: number = 10;
}
