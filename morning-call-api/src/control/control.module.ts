import { Module } from '@nestjs/common';
import { AlarmModule } from 'src/alarm/alarm.module';
import { CalendarModule } from 'src/calendar/calendar.module';
import { MemoryModule } from 'src/memory/memory.module';
import { UserModule } from 'src/user/user.module';
import { ControlController } from './control.controller';
import { ControlService } from './control.service';

@Module({
  imports: [AlarmModule, CalendarModule, MemoryModule, UserModule],
  controllers: [ControlController],
  providers: [ControlService],
})
export class ControlModule {}
