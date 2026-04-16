import { Module, forwardRef } from '@nestjs/common';
import { PromptController } from './prompt.controller';
import { HttpModule } from '@nestjs/axios';
import { AlarmModule } from 'src/alarm/alarm.module';
import { PromptService } from './prompt.service';

@Module({
  imports: [HttpModule, forwardRef(() => AlarmModule)],
  controllers: [PromptController],
  providers: [PromptService],
  exports: [PromptService],
})
export class PromptModule {}
