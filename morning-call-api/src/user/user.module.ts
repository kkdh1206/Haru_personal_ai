import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from './schemas/user.schema';
import { CryptoService } from 'src/utils/crypto.service';
import { AuthController } from 'src/auth/auth.controller';
import { Alarm, AlarmSchema } from 'src/alarm/schemas/alarm.schema';
import { Memory, MemorySchema } from 'src/memory/schemas/memory.schema';
import {
  UserProfile,
  UserProfileSchema,
} from 'src/memory/schemas/user-profile.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Alarm.name, schema: AlarmSchema },
      { name: Memory.name, schema: MemorySchema },
      { name: UserProfile.name, schema: UserProfileSchema },
    ]),
  ],
  controllers: [UserController, AuthController],
  providers: [UserService, CryptoService],
  exports: [UserService],
})
export class UserModule {}
