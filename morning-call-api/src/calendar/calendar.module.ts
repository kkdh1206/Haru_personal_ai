import { Module } from '@nestjs/common';
import { CalendarService } from './calendar.service';
import { UserModule } from 'src/user/user.module';
import { CalendarController } from './calendar.controller';
import { MongooseModule } from '@nestjs/mongoose';
import {
  AppleCalendarEvent,
  AppleCalendarEventSchema,
} from './schemas/apple-calendar-event.schema';
import {
  PendingAppleCalendarEvent,
  PendingAppleCalendarEventSchema,
} from './schemas/pending-apple-calendar-event.schema';
import { ApnsModule } from 'src/apns/apns.module';

@Module({
  imports: [
    UserModule,
    ApnsModule,
    MongooseModule.forFeature([
      { name: AppleCalendarEvent.name, schema: AppleCalendarEventSchema },
      {
        name: PendingAppleCalendarEvent.name,
        schema: PendingAppleCalendarEventSchema,
      },
    ]),
  ],
  providers: [CalendarService],
  controllers: [CalendarController],
  exports: [CalendarService],
})
export class CalendarModule {}
