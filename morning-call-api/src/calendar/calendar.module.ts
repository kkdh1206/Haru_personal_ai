import { Module } from '@nestjs/common';
import { CalendarService } from './calendar.service';
import { UserModule } from 'src/user/user.module';
import { CalendarController } from './calendar.controller';

@Module({
  imports: [UserModule],
  providers: [CalendarService],
  controllers: [CalendarController],
  exports: [CalendarService],
})
export class CalendarModule {}
