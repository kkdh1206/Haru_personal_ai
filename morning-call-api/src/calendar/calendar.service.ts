import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import { DateTime } from 'luxon';
import { randomUUID } from 'node:crypto';
import { ApnsService } from 'src/apns/apns.service';
import { UserService } from 'src/user/user.service';
import { CreateCalendarEventDto } from './dto/create-calendar-event.dto';
import {
  AppleCalendarEventDto,
  MorningCallAppleCalendarDto,
} from './dto/sync-apple-calendar.dto';

@Injectable()
export class CalendarService {
  private readonly appleCalendarQueryTimeoutMs = 5000;
  private readonly pendingAppleCalendarQueries = new Map<
    string,
    {
      userId: string;
      resolve: (
        events: ReturnType<CalendarService['normalizeAppleEvents']>,
      ) => void;
      timeout: ReturnType<typeof setTimeout>;
    }
  >();

  constructor(
    private readonly userService: UserService,
    private readonly cs: ConfigService,
    private readonly apnsService: ApnsService,
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

  private logCalendarError(action: string, error: unknown, userId?: string) {
    const message = this.getCalendarErrorMessage(error);
    console.error(`[Calendar] ${action} failed${userId ? ` user=${userId}` : ''}: ${message}`);
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
          { selectProvider: false },
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

  async getTodayEvents(
    userId: string,
    options: { requestAppleCalendar?: boolean } = {},
  ) {
    const provider = await this.userService.getCalendarProvider(userId);
    if (provider === 'apple') {
      return options.requestAppleCalendar
        ? this.requestMorningCallAppleCalendar(userId)
        : [];
    }
    if (provider !== 'google') return [];

    try {
      return await this.getGoogleTodayEvents(userId);
    } catch (e) {
      this.logCalendarError('getTodayEvents', e, userId);
      return [];
    }
  }

  /** Use the same resolved provider as Settings, once per prompt. Never persist Apple events. */
  async getMorningCallContext(userId: string) {
    const provider = await this.userService.getCalendarProvider(userId);
    if (provider === 'apple') {
      return { provider, status: 'pending_device' as const, events: [] };
    }
    if (provider !== 'google') {
      return { provider: null, status: 'not_connected' as const, events: [] };
    }
    try {
      const events = await this.getGoogleTodayEvents(userId);
      return { provider, status: 'ok' as const, events };
    } catch (error) {
      this.logCalendarError('getMorningCallContext', error, userId);
      return { provider, status: 'unavailable' as const, events: [] };
    }
  }

  private async getGoogleTodayEvents(userId: string) {
    const { calendar, timeZone } = await this.getGoogleCalendarClient(userId);
    const now = DateTime.now().setZone(timeZone);
    const res = await calendar.events.list({
      calendarId: 'primary',
      timeMin: now.startOf('day').toUTC().toISO(),
      timeMax: now.endOf('day').toUTC().toISO(),
      singleEvents: true,
      orderBy: 'startTime',
    });
    return res.data.items?.map((event) => ({
      id: event.id,
      summary: event.summary,
      description: event.description,
      start: event.start?.dateTime || event.start?.date,
      end: event.end?.dateTime || event.end?.date,
      location: event.location,
    })) || [];
  }

  async getSchedule(userId: string, date: string) {
    const provider = await this.userService.getCalendarProvider(userId);
    const user = await this.userService.findOne(userId as any);
    const timeZone = user?.timeZone || 'Asia/Seoul';

    if (provider === 'apple') {
      // Apple EventKit data is intentionally fetched only for a morning call.
      return [];
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

  async createEvent(userId: string, dto: CreateCalendarEventDto) {
    const provider = await this.userService.getCalendarProvider(userId);
    if (provider === 'apple') {
      return this.sendAppleCalendarEventToDevice(userId, dto);
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
    return this.userService.getCalendarStatus(userId);
  }

  private async requestMorningCallAppleCalendar(userId: string) {
    const user = await this.userService.findOne(userId as any);
    const timeZone = user?.timeZone || 'Asia/Seoul';
    const device = await this.userService.getUserDeviceToken(userId);
    if (device?.deviceType !== 'ios' || !device.notificationToken) {
      console.warn(
        `[Calendar] Apple morning-call query skipped: notification token missing user=${userId}`,
      );
      return [];
    }

    const now = DateTime.now().setZone(timeZone);
    const requestId = randomUUID();
    const rangeStart = now.startOf('day').toUTC().toISO();
    const rangeEnd = now.endOf('day').toUTC().toISO();
    if (!rangeStart || !rangeEnd) return [];

    const eventsPromise = new Promise<
      ReturnType<CalendarService['normalizeAppleEvents']>
    >((resolve) => {
      const timeout = setTimeout(() => {
        this.pendingAppleCalendarQueries.delete(requestId);
        console.warn(
          `[Calendar] Apple morning-call query timed out user=${userId}`,
        );
        resolve([]);
      }, this.appleCalendarQueryTimeoutMs);

      this.pendingAppleCalendarQueries.set(requestId, {
        userId: userId.toString(),
        resolve,
        timeout,
      });
    });

    try {
      const pushResult = await this.apnsService.sendAppleCalendarQueryPush(
        device.notificationToken,
        { requestId, rangeStart, rangeEnd },
        device.apnsEnvironment,
      );
      if (!pushResult.sent.length) {
        this.resolveAppleCalendarQuery(requestId, []);
      }
    } catch (error) {
      console.warn('[Calendar] Apple morning-call query push failed', error);
      this.resolveAppleCalendarQuery(requestId, []);
    }

    return eventsPromise;
  }

  receiveMorningCallAppleCalendar(
    userId: string,
    dto: MorningCallAppleCalendarDto,
  ) {
    const pending = this.pendingAppleCalendarQueries.get(dto.requestId);
    if (!pending || pending.userId !== userId.toString()) {
      return { accepted: false, reason: 'request_expired' };
    }

    const events = this.normalizeAppleEvents(dto.events || []);
    this.resolveAppleCalendarQuery(dto.requestId, events);
    return { accepted: true, received: events.length };
  }

  private normalizeAppleEvents(events: AppleCalendarEventDto[]) {
    const uniqueEvents = new Map<string, AppleCalendarEventDto>();
    for (const event of events.slice(0, 200)) {
      if (event.externalId && event.title && event.startTime && event.endTime) {
        uniqueEvents.set(event.externalId, event);
      }
    }

    return Array.from(uniqueEvents.values()).map((event) => ({
      id: event.externalId,
      summary: event.title,
      description: null,
      start: event.startTime,
      end: event.endTime,
      location: event.location || null,
    }));
  }

  private resolveAppleCalendarQuery(
    requestId: string,
    events: ReturnType<CalendarService['normalizeAppleEvents']>,
  ) {
    const pending = this.pendingAppleCalendarQueries.get(requestId);
    if (!pending) return;

    clearTimeout(pending.timeout);
    this.pendingAppleCalendarQueries.delete(requestId);
    pending.resolve(events);
  }

  private async sendAppleCalendarEventToDevice(
    userId: string,
    dto: CreateCalendarEventDto,
  ) {
    const user = await this.userService.findOne(userId as any);
    const { timeZone, allDay, resolvedEndTime } = this.resolveEventTimes(
      dto,
      user?.timeZone || 'Asia/Seoul',
    );
    const device = await this.userService.getUserDeviceToken(userId);
    if (device?.deviceType !== 'ios' || !device.notificationToken) {
      return {
        success: false,
        message:
          'iPhone에 연결할 수 없어 Apple Calendar에 일정을 추가하지 못했습니다.',
      };
    }

    try {
      const eventId = randomUUID();
      const pushResult =
        await this.apnsService.sendAppleCalendarCreateEventPush(
          device.notificationToken,
          {
            eventId,
            title: dto.title,
            startTime: dto.startTime,
            endTime: resolvedEndTime,
            description: dto.description || '',
            location: dto.location || '',
            allDay,
            timeZone,
          },
          device.apnsEnvironment,
        );
      if (!pushResult.sent.length) {
        return {
          success: false,
          message: 'iPhone에 일정 추가 요청을 전달하지 못했습니다.',
        };
      }

      return {
        success: true,
        pending: true,
        eventId,
        start: dto.startTime,
        end: resolvedEndTime,
        timeZone,
        allDay,
        message: 'iPhone의 Apple Calendar에 일정을 추가하도록 요청했습니다.',
      };
    } catch (error) {
      console.warn('[Calendar] Apple Calendar event push failed', error);
      return {
        success: false,
        message: 'iPhone에 일정 추가 요청을 전달하지 못했습니다.',
      };
    }
  }
}
