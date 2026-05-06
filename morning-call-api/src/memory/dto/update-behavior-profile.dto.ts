import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateBehaviorProfileDto {
  @ApiProperty({ required: false, enum: ['gentle', 'aggressive'] })
  @IsString()
  @IsOptional()
  wakeStyle?: 'gentle' | 'aggressive';

  @ApiProperty({ required: false, minimum: 0, maximum: 3 })
  @IsInt()
  @Min(0)
  @Max(3)
  @IsOptional()
  retryLimit?: number;

  @ApiProperty({ required: false, type: [String] })
  @IsArray()
  @IsOptional()
  toneNotes?: string[];

  @ApiProperty({ required: false, type: [String] })
  @IsArray()
  @IsOptional()
  customNotes?: string[];
}
