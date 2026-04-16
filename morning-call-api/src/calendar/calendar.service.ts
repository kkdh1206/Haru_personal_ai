import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import { DateTime } from 'luxon';
import { UserService } from 'src/user/user.service';
import { CreateCalendarEventDto } from './dto/create-calendar-event.dto';

@Injectable()
export class CalendarService {
  constructor(
    private readonly userService: UserService,
    private readonly cs: ConfigService,
  ) {}

  private async getCalendarClient(userId: string) {
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

  async getTodayEvents(userId: string) {
    try {
      const { calendar, timeZone } = await this.getCalendarClient(userId);
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
      return [];
    }
  }

  async createEvent(userId: string, dto: CreateCalendarEventDto) {
    const { calendar, timeZone: defaultTimeZone } =
      await this.getCalendarClient(userId);
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
  }
}
