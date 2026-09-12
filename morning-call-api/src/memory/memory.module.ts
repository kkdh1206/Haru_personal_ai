import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MemoryController } from './memory.controller';
import { MemoryService } from './memory.service';
import { Memory, MemorySchema } from './schemas/memory.schema';
import { UserProfile, UserProfileSchema } from './schemas/user-profile.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Memory.name, schema: MemorySchema },
      { name: UserProfile.name, schema: UserProfileSchema },
    ]),
  ],
  controllers: [MemoryController],
  providers: [MemoryService],
  exports: [MemoryService], // 다른 모듈에서 사용 가능
})
export class MemoryModule {}
