import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { MemoryController } from './memory.controller';
import { MemoryService } from './memory.service';
import { EmbeddingsService } from './embeddings.service';
import { Memory, MemorySchema } from './schemas/memory.schema';
import { UserProfile, UserProfileSchema } from './schemas/user-profile.schema';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: Memory.name, schema: MemorySchema },
      { name: UserProfile.name, schema: UserProfileSchema },
    ]),
  ],
  controllers: [MemoryController],
  providers: [MemoryService, EmbeddingsService],
  exports: [MemoryService, EmbeddingsService], // 다른 모듈에서 사용 가능
})
export class MemoryModule {}
