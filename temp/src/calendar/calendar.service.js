"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CalendarService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const googleapis_1 = require("googleapis");
const luxon_1 = require("luxon");
const user_service_1 = require("../user/user.service");
let CalendarService = class CalendarService {
    constructor(userService, cs) {
        this.userService = userService;
        this.cs = cs;
    }
    getCalendarErrorMessage(error) {
        var _a, _b, _c, _d;
        const maybeError = error;
        const reason = ((_b = (_a = maybeError.response) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.error) ||
            ((_d = (_c = maybeError.response) === null || _c === void 0 ? void 0 : _c.data) === null || _d === void 0 ? void 0 : _d.error_description) ||
            maybeError.message;
        if (reason === 'unauthorized_client' ||
            String(reason || '')
                .toLowerCase()
                .includes('unauthorized')) {
            return 'Google Calendar needs to be reconnected.';
        }
        if (reason) {
            return `Google Calendar request failed: ${reason}`;
        }
        return 'Unknown calendar error';
    }
    logCalendarError(action, error) {
        const message = this.getCalendarErrorMessage(error);
        console.error(`[Calendar] ${action} failed: ${message}`);
    }
    async getCalendarClient(userId) {
        const token = await this.userService.getUserCalendarToken(userId);
        const user = await this.userService.findOne(userId);
        const { calendarAccessToken, calendarRefreshToken } = token;
        const oAuth2Client = new googleapis_1.google.auth.OAuth2(this.cs.get('google.clientId'), this.cs.get('google.clientSecret'));
        oAuth2Client.setCredentials({
            access_token: calendarAccessToken,
            refresh_token: calendarRefreshToken,
        });
        oAuth2Client.on('tokens', async (tokens) => {
            var _a;
            if (tokens.access_token) {
                await this.userService.updateCalendarToken(userId, tokens.access_token, (_a = tokens.refresh_token) !== null && _a !== void 0 ? _a : calendarRefreshToken);
            }
        });
        return {
            calendar: googleapis_1.google.calendar({ version: 'v3', auth: oAuth2Client }),
            timeZone: (user === null || user === void 0 ? void 0 : user.timeZone) || 'Asia/Seoul',
        };
    }
    isAllDayValue(value) {
        return /^\d{4}-\d{2}-\d{2}$/.test(value);
    }
    async getTodayEvents(userId) {
        var _a;
        try {
            const { calendar, timeZone } = await this.getCalendarClient(userId);
            const now = luxon_1.DateTime.now().setZone(timeZone);
            const res = await calendar.events.list({
                calendarId: 'primary',
                timeMin: now.startOf('day').toUTC().toISO(),
                timeMax: now.endOf('day').toUTC().toISO(),
                singleEvents: true,
                orderBy: 'startTime',
            });
            return (((_a = res.data.items) === null || _a === void 0 ? void 0 : _a.map((event) => {
                var _a, _b, _c, _d;
                return ({
                    id: event.id,
                    summary: event.summary,
                    description: event.description,
                    start: ((_a = event.start) === null || _a === void 0 ? void 0 : _a.dateTime) || ((_b = event.start) === null || _b === void 0 ? void 0 : _b.date),
                    end: ((_c = event.end) === null || _c === void 0 ? void 0 : _c.dateTime) || ((_d = event.end) === null || _d === void 0 ? void 0 : _d.date),
                    location: event.location,
                });
            })) || []);
        }
        catch (e) {
            this.logCalendarError('getTodayEvents', e);
            return [];
        }
    }
    async getSchedule(userId, date) {
        var _a;
        try {
            const { calendar, timeZone } = await this.getCalendarClient(userId);
            const target = luxon_1.DateTime.fromISO(date, { zone: timeZone });
            const res = await calendar.events.list({
                calendarId: 'primary',
                timeMin: target.startOf('day').toUTC().toISO(),
                timeMax: target.endOf('day').toUTC().toISO(),
                singleEvents: true,
                orderBy: 'startTime',
            });
            return (((_a = res.data.items) === null || _a === void 0 ? void 0 : _a.map((event) => {
                var _a, _b, _c, _d;
                return ({
                    id: event.id,
                    summary: event.summary,
                    description: event.description,
                    start: ((_a = event.start) === null || _a === void 0 ? void 0 : _a.dateTime) || ((_b = event.start) === null || _b === void 0 ? void 0 : _b.date),
                    end: ((_c = event.end) === null || _c === void 0 ? void 0 : _c.dateTime) || ((_d = event.end) === null || _d === void 0 ? void 0 : _d.date),
                    location: event.location,
                });
            })) || []);
        }
        catch (e) {
            this.logCalendarError('getSchedule', e);
            return [];
        }
    }
    async createEvent(userId, dto) {
        try {
            const { calendar, timeZone: defaultTimeZone } = await this.getCalendarClient(userId);
            const timeZone = dto.timeZone || defaultTimeZone;
            const allDay = dto.allDay ||
                this.isAllDayValue(dto.startTime) ||
                (!!dto.endTime && this.isAllDayValue(dto.endTime));
            const resolvedEndTime = dto.endTime ||
                (allDay
                    ? luxon_1.DateTime.fromISO(dto.startTime, { zone: timeZone })
                        .plus({ days: 1 })
                        .toISODate()
                    : luxon_1.DateTime.fromISO(dto.startTime, { zone: timeZone })
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
        catch (e) {
            this.logCalendarError('createEvent', e);
            const message = this.getCalendarErrorMessage(e);
            return {
                success: false,
                message: message === 'Google Calendar needs to be reconnected.'
                    ? '캘린더를 다시 연동해야 일정을 저장할 수 있습니다.'
                    : '캘린더 일정 저장에 실패했습니다.',
            };
        }
    }
};
CalendarService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [user_service_1.UserService,
        config_1.ConfigService])
], CalendarService);
exports.CalendarService = CalendarService;
//# sourceMappingURL=calendar.service.js.map