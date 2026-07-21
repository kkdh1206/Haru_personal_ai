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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PromptService = void 0;
const common_1 = require("@nestjs/common");
const luxon_1 = require("luxon");
const alarm_service_1 = require("../alarm/alarm.service");
const calendar_service_1 = require("../calendar/calendar.service");
const information_service_1 = require("../information/information.service");
const prompt_1 = require("./prompt");
let PromptService = class PromptService {
    constructor(alarmService, calendarService, informationService) {
        this.alarmService = alarmService;
        this.calendarService = calendarService;
        this.informationService = informationService;
    }
    getMaxDailyRetryCalls() {
        return this.alarmService.getMaxDailyRetryCalls();
    }
    formatScheduleTime(value, timeZone) {
        if (!value) {
            return value;
        }
        if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
            return `${value} 종일`;
        }
        const parsed = luxon_1.DateTime.fromISO(value, { setZone: true });
        if (!parsed.isValid) {
            return value;
        }
        return parsed.setZone(timeZone).toFormat('MM월 dd일 HH:mm');
    }
    normalizeSchedules(schedules, timeZone) {
        return (schedules || []).map((item) => (Object.assign(Object.assign({}, item), { start: this.formatScheduleTime(item.start, timeZone), end: this.formatScheduleTime(item.end, timeZone) })));
    }
    formatWeatherInfo(weather, timeZone) {
        if (!weather) {
            return '정보 없음';
        }
        const observedAt = this.formatWeatherObservedAt(weather.observed_at, timeZone);
        const locationLabel = [weather.city, weather.country]
            .filter(Boolean)
            .join(', ');
        const parts = [
            locationLabel ? `${locationLabel} 기준` : null,
            observedAt ? `관측 ${observedAt}` : null,
            weather.weather,
            weather.temperature != null
                ? `현재 ${this.formatWeatherNumber(weather.temperature)}도`
                : null,
            weather.feels_like != null
                ? `체감 ${this.formatWeatherNumber(weather.feels_like)}도`
                : null,
            weather.temp_min != null && weather.temp_max != null
                ? `주변 기온 ${this.formatWeatherNumber(weather.temp_min)}~${this.formatWeatherNumber(weather.temp_max)}도`
                : null,
            weather.humidity != null ? `습도 ${weather.humidity}%` : null,
            weather.wind_speed != null
                ? `바람 ${this.formatWeatherNumber(weather.wind_speed)}m/s`
                : null,
            weather.wind_gust != null
                ? `돌풍 ${this.formatWeatherNumber(weather.wind_gust)}m/s`
                : null,
            weather.cloudiness != null ? `구름 ${weather.cloudiness}%` : null,
            weather.visibility != null
                ? `가시거리 ${(weather.visibility / 1000).toFixed(1)}km`
                : null,
            weather.rain_1h != null
                ? `최근 1시간 비 ${this.formatWeatherNumber(weather.rain_1h)}mm`
                : null,
            weather.snow_1h != null
                ? `최근 1시간 눈 ${this.formatWeatherNumber(weather.snow_1h)}mm`
                : null,
        ].filter(Boolean);
        return parts.length ? parts.join(', ') : '정보 없음';
    }
    formatWeatherNumber(value) {
        return Number(value).toFixed(1).replace(/\.0$/, '');
    }
    formatWeatherObservedAt(value, timeZone = 'Asia/Seoul') {
        if (!value) {
            return '';
        }
        const parsed = luxon_1.DateTime.fromISO(value, { setZone: true });
        if (!parsed.isValid) {
            return '';
        }
        return parsed.setZone(timeZone || 'Asia/Seoul').toFormat('HH:mm');
    }
    async getPrompt(alarmId, callType = 'initial', retryCount = 0) {
        const alarm = await this.alarmService.getAlarmWithUser(alarmId);
        if (!(alarm === null || alarm === void 0 ? void 0 : alarm.user)) {
            throw new Error(`Alarm user not found for alarm ${alarmId}`);
        }
        const user = alarm.user;
        const timeZone = user.timeZone || 'Asia/Seoul';
        const retryCallsRemaining = Math.max(0, this.getMaxDailyRetryCalls() - (alarm.dailyRetryCount || 0));
        const now = luxon_1.DateTime.now().setZone(timeZone);
        const todayLabel = now.toFormat('yyyy년 MM월 dd일 cccc');
        const currentTimeLabel = now.toFormat('yyyy년 MM월 dd일 cccc HH:mm');
        const currentIsoTime = now.toISO() || now.toFormat("yyyy-MM-dd'T'HH:mm:ssZZ");
        const schedules = this.normalizeSchedules(await this.calendarService.getTodayEvents(user._id), timeZone);
        const weather = await this.informationService.getCurrentWeather(user.location || 'Seoul');
        const weatherInfo = this.formatWeatherInfo(weather, timeZone);
        const prompt = (0, prompt_1.buildMorningCallPrompt)({
            name: user.name,
            assistantName: alarm.role || '하루',
            language: user.language,
            timeZone,
            wakeIntensity: alarm.wakeIntensity,
            callType,
            retryCount,
            retryCallsRemaining,
            lastWakeStatus: alarm.lastWakeStatus,
            customMessage: user.customMessage,
            todayLabel,
            currentTimeLabel,
            currentIsoTime,
            schedule: schedules,
            weather: weatherInfo,
        });
        return prompt;
    }
    async getTestCallPrompt(user, wakeIntensity = 'gentle', assistantName = '하루') {
        const timeZone = user.timeZone || 'Asia/Seoul';
        const now = luxon_1.DateTime.now().setZone(timeZone);
        const todayLabel = now.toFormat('yyyy년 MM월 dd일 cccc');
        const currentTimeLabel = now.toFormat('yyyy년 MM월 dd일 cccc HH:mm');
        const currentIsoTime = now.toISO() || now.toFormat("yyyy-MM-dd'T'HH:mm:ssZZ");
        const schedules = this.normalizeSchedules(await this.calendarService.getTodayEvents(user._id), timeZone);
        const weather = await this.informationService.getCurrentWeather(user.location || 'Seoul');
        const weatherInfo = this.formatWeatherInfo(weather, timeZone);
        const prompt = (0, prompt_1.buildMorningCallPrompt)({
            name: user.name,
            assistantName,
            language: user.language,
            timeZone,
            wakeIntensity,
            callType: 'initial',
            retryCount: 0,
            retryCallsRemaining: this.getMaxDailyRetryCalls(),
            lastWakeStatus: null,
            customMessage: user.customMessage,
            todayLabel,
            currentTimeLabel,
            currentIsoTime,
            schedule: schedules,
            weather: weatherInfo,
        });
        return prompt;
    }
};
PromptService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)((0, common_1.forwardRef)(() => alarm_service_1.AlarmService))),
    __metadata("design:paramtypes", [alarm_service_1.AlarmService,
        calendar_service_1.CalendarService,
        information_service_1.InformationService])
], PromptService);
exports.PromptService = PromptService;
//# sourceMappingURL=prompt.service.js.map