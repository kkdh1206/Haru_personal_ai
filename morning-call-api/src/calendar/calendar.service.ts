import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { google } from 'googleapis';
import { DateTime } from 'luxon';
import { Model } from 'mongoose';
import { ApnsService } from 'src/apns/apns.service';
import { UserService } from 'src/user/user.service';
import { CompleteAppleCalendarEventDto } from './dto/complete-apple-calendar-event.dto';
import { CreateCalendarEventDto } from './dto/create-calendar-event.dto';
import {
  AppleCalendarEventDto,
  SyncAppleCalendarDto,
} from './dto/sync-apple-calendar.dto';
import {
  AppleCalendarEvent,
  AppleCalendarEventDocument,
} from './schemas/apple-calendar-event.schema';
import {
  PendingAppleCalendarEvent,
  PendingAppleCalendarEventDocument,
} from './schemas/pending-apple-calendar-event.schema';

@Injectable()
export class CalendarService {
  constructor(
    private readonly userService: UserService,
    private readonly cs: ConfigService,
    private readonly apnsService: ApnsService,
    @InjectModel(AppleCalendarEvent.name)
    private readonly appleEventModel: Model<AppleCalendarEventDocument>,
    @InjectModel(PendingAppleCalendarEvent.name)
    private readonly pendingAppleEventModel: Model<PendingAppleCalendarEventDocument>,
  ) {}

  private getCalendarErrorMessage(error: unknown) {
    const maybeError = error as {
      message?: string;
      response?: { data?: { error?: string; error_description?: string } };
    };
    const reason =
      maybeError.response?.data?.error ||
      maybeError.response?.data?.error_description ||
      maybeError.message;

    if (
      reason === 'unauthorized_client' ||
      String(reason || '')
        .toLowerCase()
        .includes('unauthorized')
    ) {
      return 'Google Calendar needs to be reconnected.';
    }

    if (reason) {
      return `Google Calendar request failed: ${reason}`;
    }

    return 'Unknown calendar error';
  }

  private logCalendarError(action: string, error: unknown) {
    const message = this.getCalendarErrorMessage(error);
    console.error(`[Calendar] ${action} failed: ${message}`);
  }

  private async getGoogleCalendarClient(userId: string) {
    const token = await this.userService.getUserCalendarToken(userId);
    const user = await this.userService.findOne(userId as any);
    const { calendarAccessToken, calendarRefreshToken } = token;

    const oAuth2Client = new google.auth.OAuth2(
      this.cs.get<string>('google.clientId'),
      this.cs.get<string>('google.clientSecret'),
    );

    oAuth2Client.setCredentials({
      access_token: calendarAccessToken,
      refresh_token: calendarRefreshToken,
    });

    oAuth2Client.on('tokens', async (tokens) => {
      if (tokens.access_token) {
        await this.userService.updateCalendarToken(
          userId,
          tokens.access_token,
          tokens.refresh_token ?? calendarRefreshToken,
        );
      }
    });

    return {
      calendar: google.calendar({ version: 'v3', auth: oAuth2Client }),
      timeZone: user?.timeZone || 'Asia/Seoul',
    };
  }

  private isAllDayValue(value: string) {
    return /^\d{4}-\d{2}-\d{2}$/.test(value);
  }

  private resolveEventTimes(
    dto: CreateCalendarEventDto,
    defaultTimeZone: string,
  ) {
    const timeZone = dto.timeZone || defaultTimeZone;
    const allDay =
      dto.allDay ||
      this.isAllDayValue(dto.startTime) ||
      (!!dto.endTime && this.isAllDayValue(dto.endTime));
    const resolvedEndTime =
      dto.endTime ||
      (allDay
        ? DateTime.fromISO(dto.startTime, { zone: timeZone })
            .plus({ days: 1 })
            .toISODate()
        : DateTime.fromISO(dto.startTime, { zone: timeZone })
            .plus({ hours: 1 })
            .toISO());

    return { timeZone, allDay, resolvedEndTime };
  }

  async getTodayEvents(userId: string) {
    const provider = await this.userService.getCalendarProvider(userId);
    if (provider === 'apple') {
      const user = await this.userService.findOne(userId as any);
      const timeZone = user?.timeZone || 'Asia/Seoul';
      const today = DateTime.now().setZone(timeZone).toISODate();
      return this.getAppleSchedule(userId, today, timeZone);
    }
    if (provider !== 'google') return [];

    try {
      const { calendar, timeZone } =
        await this.getGoogleCalendarClient(userId);
      const now = DateTime.now().setZone(timeZone);

      const res = await calendar.events.list({
        calendarId: 'primary',
        timeMin: now.startOf('day').toUTC().toISO(),
        timeMax: now.endOf('day').toUTC().toISO(),
        singleEvents: true,
        orderBy: 'startTime',
      });

      return (
        res.data.items?.map((event) => ({
          id: event.id,
          summary: event.summary,
          description: event.description,
          start: event.start?.dateTime || event.start?.date,
          end: event.end?.dateTime || event.end?.date,
          location: event.location,
        })) || []
      );
    } catch (e) {
      this.logCalendarError('getTodayEvents', e);
      return [];
    }
  }

  async getSchedule(userId: string, date: string) {
    const provider = await this.userService.getCalendarProvider(userId);
    const user = await this.userService.findOne(userId as any);
    const timeZone = user?.timeZone || 'Asia/Seoul';

    if (provider === 'apple') {
      return this.getAppleSchedule(userId, date, timeZone);
    }
    if (provider !== 'google') return [];

    try {
      const { calendar } = await this.getGoogleCalendarClient(userId);
      const target = DateTime.fromISO(date, { zone: timeZone });

      const res = await calendar.events.list({
        calendarId: 'primary',
        timeMin: target.startOf('day').toUTC().toISO(),
        timeMax: target.endOf('day').toUTC().toISO(),
        singleEvents: true,
        orderBy: 'startTime',
      });

      return (
        res.data.items?.map((event) => ({
          id: event.id,
          summary: event.summary,
          description: event.description,
          start: event.start?.dateTime || event.start?.date,
          end: event.end?.dateTime || event.end?.date,
          location: event.location,
        })) || []
      );
    } catch (e) {
      this.logCalendarError('getSchedule', e);
      return [];
    }
  }

  private async getAppleSchedule(
    userId: string,
    date: string,
    timeZone: string,
  ) {
    const target = DateTime.fromISO(date, { zone: timeZone });
    if (!target.isValid) return [];

    const events = await this.appleEventModel
      .find({
        userId,
        startAt: { $lt: target.endOf('day').toUTC().toJSDate() },
        endAt: { $gt: target.startOf('day').toUTC().toJSDate() },
      })
      .sort({ allDay: -1, startAt: 1 })
      .lean();

    return events.map((event) => ({
      id: event.externalId,
      summary: event.summary,
      description: event.description,
      start: event.start,
      end: event.end,
      location: event.location,
    }));
  }

  async createEvent(userId: string, dto: CreateCalendarEventDto) {
    const provider = await this.userService.getCalendarProvider(userId);
    if (provider === 'apple') {
      return this.queueAppleCalendarEvent(userId, dto);
    }
    if (provider !== 'google') {
      return {
        success: false,
        message: '캘린더를 먼저 연결해야 일정을 저장할 수 있습니다.',
      };
    }

    try {
      const { calendar, timeZone: defaultTimeZone } =
        await this.getGoogleCalendarClient(userId);
      const { timeZone, allDay, resolvedEndTime } = this.resolveEventTimes(
        dto,
        defaultTimeZone,
      );

      const requestBody = allDay
        ? {
            summary: dto.title,
            description: dto.description,
            location: dto.location,
            start: { date: dto.startTime },
            end: { date: resolvedEndTime },
          }
        : {
            summary: dto.title,
            description: dto.description,
            location: dto.location,
            start: { dateTime: dto.startTime, timeZone },
            end: { dateTime: resolvedEndTime, timeZone },
          };

      const res = await calendar.events.insert({
        calendarId: 'primary',
        requestBody,
      });

      return {
        success: true,
        eventId: res.data.id,
        htmlLink: res.data.htmlLink,
        start: dto.startTime,
        end: resolvedEndTime,
        timeZone,
        allDay,
      };
    } catch (e) {
      this.logCalendarError('createEvent', e);
      const message = this.getCalendarErrorMessage(e);
      return {
        success: false,
        message:
          message === 'Google Calendar needs to be reconnected.'
            ? '캘린더를 다시 연동해야 일정을 저장할 수 있습니다.'
            : '캘린더 일정 저장에 실패했습니다.',
      };
    }
  }

  async connectAppleCalendar(userId: string) {
    const user = await this.userService.connectAppleCalendar(userId);
    if (!user) throw new NotFoundException('User not found');
    return this.userService.getCalendarStatus(userId);
  }

  async disconnectAppleCalendar(userId: string) {
    const user = await this.userService.disconnectAppleCalendar(userId);
    if (!user) throw new NotFoundException('User not found');
    await Promise.all([
      this.appleEventModel.deleteMany({ userId }),
      this.pendingAppleEventModel.deleteMany({ userId, status: 'pending' }),
    ]);
    return this.userService.getCalendarStatus(userId);
  }

  async syncAppleCalendar(userId: string, dto: SyncAppleCalendarDto) {
    const status = await this.userService.getCalendarStatus(userId);
    if (!status.appleConnected) {
      throw new NotFoundException('Apple Calendar is not connected');
    }

    const user = await this.userService.findOne(userId as any);
    const timeZone = user?.timeZone || 'Asia/Seoul';
    const uniqueEvents = new Map<string, AppleCalendarEventDto>();
    for (const event of dto.events || []) {
      if (event.externalId && event.title && event.startTime && event.endTime) {
        uniqueEvents.set(event.externalId, event);
      }
    }

    const documents = Array.from(uniqueEvents.values())
      .map((event) => this.appleEventDocument(userId, event, timeZone))
      .filter(Boolean);

    await this.appleEventModel.deleteMany({ userId });
    if (documents.length) {
      await this.appleEventModel.insertMany(documents, { ordered: false });
    }

    const syncedAt = new Date();
    await this.userService.markAppleCalendarSynced(userId, syncedAt);
    return { synced: documents.length, syncedAt: syncedAt.toISOString() };
  }

  private appleEventDocument(
    userId: string,
    event: AppleCalendarEventDto,
    timeZone: string,
  ) {
    const allDay =
      Boolean(event.allDay) ||
      this.isAllDayValue(event.startTime) ||
      this.isAllDayValue(event.endTime);
    const start = DateTime.fromISO(event.startTime, { zone: timeZone });
    const end = DateTime.fromISO(event.endTime, { zone: timeZone });
    if (!start.isValid || !end.isValid || end <= start) return null;

    return {
      userId,
      externalId: event.externalId,
      summary: event.title,
      description: event.description || null,
      start: event.startTime,
      end: event.endTime,
      startAt: start.toUTC().toJSDate(),
      endAt: end.toUTC().toJSDate(),
      location: event.location || null,
      allDay,
      calendarTitle: event.calendarTitle || null,
    };
  }

  async getPendingAppleCalendarEvents(userId: string) {
    const events = await this.pendingAppleEventModel
      .find({ userId, status: 'pending' })
      .sort({ createdAt: 1 })
      .limit(50)
      .lean();

    return events.map((event) => ({
      id: event._id.toString(),
      title: event.title,
      startTime: event.startTime,
      endTime: event.endTime,
      description: event.description,
      location: event.location,
      allDay: event.allDay,
      timeZone: event.timeZone,
    }));
  }

  async completePendingAppleCalendarEvent(
    userId: string,
    eventId: string,
    dto: CompleteAppleCalendarEventDto,
  ) {
    const event = await this.pendingAppleEventModel
      .findOneAndUpdate(
        { _id: eventId, userId, status: 'pending' },
        {
          $set: {
            status: dto.success ? 'completed' : 'failed',
            deviceEventId: dto.eventIdentifier || null,
            errorMessage: dto.errorMessage || null,
            completedAt: new Date(),
          },
        },
        { new: true },
      )
      .lean();
    if (!event) throw new NotFoundException('Pending calendar event not found');
    return { completed: dto.success };
  }

  private async queueAppleCalendarEvent(
    userId: string,
    dto: CreateCalendarEventDto,
  ) {
    const user = await this.userService.findOne(userId as any);
    const { timeZone, allDay, resolvedEndTime } = this.resolveEventTimes(
      dto,
      user?.timeZone || 'Asia/Seoul',
    );
    const event = await this.pendingAppleEventModel.create({
      userId,
      title: dto.title,
      startTime: dto.startTime,
      endTime: resolvedEndTime,
      description: dto.description || null,
      location: dto.location || null,
      allDay,
      timeZone,
    });

    try {
      const device = await this.userService.getUserDeviceToken(userId);
      if (device?.deviceType === 'ios' && device.notificationToken) {
        await this.apnsService.sendAppleCalendarSyncPush(
          device.notificationToken,
          device.apnsEnvironment,
        );
      }
    } catch (error) {
      console.warn('[Calendar] Apple Calendar sync push failed', error);
    }

    return {
      success: true,
      pending: true,
      eventId: event._id.toString(),
      start: dto.startTime,
      end: resolvedEndTime,
      timeZone,
      allDay,
      message: 'iPhone의 Apple Calendar에 일정을 추가하도록 요청했습니다.',
    };
  }
}
