import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import { AlarmService } from 'src/alarm/alarm.service';
import { CalendarService } from 'src/calendar/calendar.service';
import { InformationService } from 'src/information/information.service';
import { buildMorningCallPrompt, buildTestCallPrompt } from './prompt';

@Injectable()
export class PromptService {
  constructor(
    @Inject(forwardRef(() => AlarmService))
    private readonly alarmService: AlarmService,
    private readonly calendarService: CalendarService,
    private readonly informationService: InformationService,
  ) {}

  private getMaxDailyRetryCalls() {
    return this.alarmService.getMaxDailyRetryCalls();
  }

  private formatScheduleTime(value: string, timeZone: string) {
    if (!value) {
      return value;
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return `${value} 종일`;
    }

    const parsed = DateTime.fromISO(value, { setZone: true });
    if (!parsed.isValid) {
      return value;
    }

    return parsed.setZone(timeZone).toFormat('MM월 dd일 HH:mm');
  }

  private normalizeSchedules(schedules: any[], timeZone: string) {
    return (schedules || []).map((item: any) => ({
      ...item,
      start: this.formatScheduleTime(item.start, timeZone),
      end: this.formatScheduleTime(item.end, timeZone),
    }));
  }

  private formatWeatherInfo(weather: any, timeZone: string) {
    if (!weather) {
      return '정보 없음';
    }

    const observedAt = this.formatWeatherObservedAt(
      weather.observed_at,
      timeZone,
    );
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
        ? `주변 기온 ${this.formatWeatherNumber(
            weather.temp_min,
          )}~${this.formatWeatherNumber(weather.temp_max)}도`
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

  private formatWeatherNumber(value: number) {
    return Number(value).toFixed(1).replace(/\.0$/, '');
  }

  private formatWeatherObservedAt(
    value?: string | null,
    timeZone = 'Asia/Seoul',
  ) {
    if (!value) {
      return '';
    }

    const parsed = DateTime.fromISO(value, { setZone: true });
    if (!parsed.isValid) {
      return '';
    }

    return parsed.setZone(timeZone || 'Asia/Seoul').toFormat('HH:mm');
  }

  async getPrompt(
    alarmId: string,
    callType: 'initial' | 'retry' = 'initial',
    retryCount = 0,
  ) {
    const alarm: any = await this.alarmService.getAlarmWithUser(alarmId);
    if (!alarm?.user) {
      throw new Error(`Alarm user not found for alarm ${alarmId}`);
    }

    const user: any = alarm.user;
    const timeZone = user.timeZone || 'Asia/Seoul';
    const retryCallsRemaining = Math.max(
      0,
      this.getMaxDailyRetryCalls() - (alarm.dailyRetryCount || 0),
    );
    const now = DateTime.now().setZone(timeZone);
    const todayLabel = now.toFormat('yyyy년 MM월 dd일 cccc');
    const currentTimeLabel = now.toFormat('yyyy년 MM월 dd일 cccc HH:mm');
    const currentIsoTime =
      now.toISO() || now.toFormat("yyyy-MM-dd'T'HH:mm:ssZZ");

    // Settings and the call must agree, including legacy provider/token states.
    const calendar = await this.calendarService.getMorningCallContext(user._id);
    const calendarOnDevice = calendar.provider === 'apple';
    const schedules = this.normalizeSchedules(
      calendar.events,
      timeZone,
    );
    console.log(`[Calendar] call-context ${JSON.stringify({
      alarmId, userId: String(user._id), provider: calendar.provider,
      status: calendar.status, timeZone,
      // null means pending/failed, never a confirmed empty calendar.
      eventCount: calendar.status === 'ok' ? schedules.length : null,
      transport: calendarOnDevice ? 'livekit-device' : calendar.provider === 'google' ? 'google-api' : 'none',
    })}`);

    // 2. 날씨 가져오기
    const weather = await this.informationService.getCurrentWeather(
      user.location || 'Seoul',
    );
    const weatherInfo = this.formatWeatherInfo(weather, timeZone);

    // 3. 일정, 날씨를 바탕으로 프롬프트 구성
    const prompt = buildMorningCallPrompt({
      name: user.name,
      assistantName: alarm.role || '하리',
      language: user.language,
      speechStyle: user.speechStyle,
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
      calendarOnDevice,
      calendarUnavailableReason: calendar.status === 'unavailable'
        ? '캘린더 조회 실패. 일정을 확인하지 못했으며 일정 없음으로 단정하지 않는다.'
        : calendar.status === 'not_connected'
          ? '캘린더가 연결되지 않아 일정을 확인할 수 없다. 일정 없음으로 단정하지 않는다.'
          : undefined,
      weather: weatherInfo,
    });

    return prompt;
  }

  async getTestCallPrompt(
    user,
    _wakeIntensity = 'gentle',
    assistantName = '하리',
  ) {
    return buildTestCallPrompt({
      name: user.name || '사용자',
      assistantName,
      language: user.language || '한국어',
      speechStyle: user.speechStyle,
    });
  }
}
