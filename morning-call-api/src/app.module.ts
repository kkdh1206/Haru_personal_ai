import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import configuration from './config/configuration';
import { HttpModule } from '@nestjs/axios';
import { AlarmModule } from './alarm/alarm.module';
import { UserModule } from './user/user.module';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { InformationModule } from './information/information.module';
import { RedisModule } from './redis/redis.module';
import { CalendarModule } from './calendar/calendar.module';
import { LivekitService } from './livekit/livekit.service';
import { PromptModule } from './prompt/prompt.module';
import { LivekitController } from './livekit/livekit.controller';
import { MemoryModule } from './memory/memory.module';
import { BillingModule } from './billing/billing.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [configuration],
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (cs: ConfigService) => ({
        uri: cs.get<string>('mongo.uri'),
        dbName: cs.get<string>('mongo.dbName'),
      }),
      inject: [ConfigService],
    }),
    HttpModule,
    RedisModule,
    AlarmModule,
    UserModule,
    InformationModule,
    CalendarModule,
    PromptModule,
    MemoryModule,
    BillingModule,
  ],
  controllers: [AppController, LivekitController],
  providers: [AppService, LivekitService],
})
export class AppModule {}
