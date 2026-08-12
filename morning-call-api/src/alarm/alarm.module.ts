import { Module } from '@nestjs/common';
import { AlarmController } from './alarm.controller';
import { AlarmService } from './alarm.service';
import { HttpModule } from '@nestjs/axios';
import { Alarm, AlarmSchema } from './schemas/alarm.schema';
import { MongooseModule } from '@nestjs/mongoose';
import { UserModule } from 'src/user/user.module';
import { ApnsService } from 'src/apns/apns.service';
import { CalendarModule } from 'src/calendar/calendar.module';
import { InformationModule } from 'src/information/information.module';
import { AlarmProcessor } from './alarm.processor';
import { BullModule } from '@nestjs/bullmq';
import { BullBoardModule } from 'src/bull-board/bull-board.module';
import { LivekitService } from 'src/livekit/livekit.service';
import { PromptModule } from 'src/prompt/prompt.module';
import { FcmService } from 'src/fcm/fcm.service';
import { BillingModule } from 'src/billing/billing.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Alarm.name, schema: AlarmSchema }]),
    BullModule.forRoot({
      connection: { host: 'localhost', port: 6379 },
    }),
    BullModule.registerQueue({ name: 'alarm' }),
    BullBoardModule,
    HttpModule,
    UserModule,
    CalendarModule,
    InformationModule,
    PromptModule,
    BillingModule,
  ],
  controllers: [AlarmController],
  providers: [
    AlarmService,
    AlarmProcessor,
    ApnsService,
    FcmService,
    LivekitService,
  ],
  exports: [AlarmService, CalendarModule, InformationModule],
})
export class AlarmModule {}
