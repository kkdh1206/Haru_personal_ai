import { IsString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';

export class SaveReminderDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  content: string;

  @IsEnum(['high', 'normal'])
  @IsOptional()
  priority?: 'high' | 'normal' = 'normal';
}
