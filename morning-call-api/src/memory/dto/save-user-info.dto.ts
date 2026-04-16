import { IsString, IsNotEmpty } from 'class-validator';

export class SaveUserInfoDto {
  @IsString()
  @IsNotEmpty()
  userId: string; // User ObjectId string

  @IsString()
  @IsNotEmpty()
  key: string; // 예: "birthday", "university", "favorite_food"

  @IsNotEmpty()
  value: any; // 동적 값 (string, number, object 등)
}
