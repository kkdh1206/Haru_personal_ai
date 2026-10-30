import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { SPEECH_STYLE_CODES } from 'src/prompt/speech-style';

export class UpdateUserDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  name?: string;

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

  @ApiProperty({ enum: SPEECH_STYLE_CODES, required: false })
  @IsString()
  @IsIn([...SPEECH_STYLE_CODES])
  @IsOptional()
  speechStyle?: string;
}
