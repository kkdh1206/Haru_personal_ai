import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateUserDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty({ default: 'korea-top' })
  @IsString()
  @IsOptional()
  interest?: string = 'korea-top';

  @ApiProperty()
  @IsString()
  @IsOptional()
  location?: string;

  @ApiProperty({ enum: ['한국어', 'English', '日本語'] })
  @IsString()
  @IsIn(['한국어', 'English', '日本語'])
  @IsOptional()
  language?: string;
}
