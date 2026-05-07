import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import { AlarmService } from 'src/alarm/alarm.service';
import { CalendarService } from 'src/calendar/calendar.service';
import { InformationService } from 'src/information/information.service';
import { buildMorningCallPrompt } from './prompt';

@Injectable()
export class PromptService {
  constructor(
    @Inject(forwardRef(() => AlarmService))
    private readonly alarmService: AlarmService,
    private readonly calendarService: CalendarService,
    private readonly informationService: InformationService,
  ) {}

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
    const now = DateTime.now().setZone(timeZone);
    const todayLabel = now.toFormat('yyyy년 MM월 dd일 cccc');
    const currentTimeLabel = now.toFormat('yyyy년 MM월 dd일 cccc HH:mm:ss');
    const currentIsoTime = now.toISO() || now.toFormat("yyyy-MM-dd'T'HH:mm:ssZZ");

    // 1. 구글 캘린더 일정 조회
    const schedules = this.normalizeSchedules(
      await this.calendarService.getTodayEvents(user._id),
      timeZone,
    );

    // 2. 뉴스, 날씨 가져오기
    const news = await this.informationService.getCurrentNews(
      user.interest || 'korea-top',
    );
    const newsInfo = Array.isArray(news)
      ? news.map((item: any) => item.title).filter(Boolean)
      : [];
    const weather = await this.informationService.getCurrentWeather(
      user.location || 'Seoul',
    );
    const weatherInfo = weather
      ? `${weather.city} ${weather.weather}, ${weather.temperature}, 체감 ${weather.feels_like}`
      : '정보 없음';

    // 3. 일정, 뉴스, 날씨를 바탕으로 프롬프트 구성
    const prompt = buildMorningCallPrompt({
      name: user.name,
      language: user.language,
      timeZone,
      wakeIntensity: alarm.wakeIntensity,
      callType,
      retryCount,
      customMessage: user.customMessage,
      todayLabel,
      currentTimeLabel,
      currentIsoTime,
      schedule: schedules,
      news: newsInfo,
      weather: weatherInfo,
    });

    return prompt;
  }

  async getTestCallPrompt(user, wakeIntensity = 'gentle') {
    const timeZone = user.timeZone || 'Asia/Seoul';
    const now = DateTime.now().setZone(timeZone);
    const todayLabel = now.toFormat('yyyy년 MM월 dd일 cccc');
    const currentTimeLabel = now.toFormat('yyyy년 MM월 dd일 cccc HH:mm:ss');
    const currentIsoTime = now.toISO() || now.toFormat("yyyy-MM-dd'T'HH:mm:ssZZ");

    // 1. 구글 캘린더 일정 조회
    const schedules = this.normalizeSchedules(
      await this.calendarService.getTodayEvents(user._id),
      timeZone,
    );

    // 2. 뉴스, 날씨 가져오기
    const news = await this.informationService.getCurrentNews(
      user.interest || 'korea-top',
    );
    const newsInfo = Array.isArray(news)
      ? news.map((item: any) => item.title).filter(Boolean)
      : [];
    const weather = await this.informationService.getCurrentWeather(
      user.location || 'Seoul',
    );
    const weatherInfo = weather
      ? `${weather.city} ${weather.weather}, ${weather.temperature}, 체감 ${weather.feels_like}`
      : '정보 없음';

    // 3. 일정, 뉴스, 날씨를 바탕으로 프롬프트 구성
    const prompt = buildMorningCallPrompt({
      name: user.name,
      language: user.language,
      timeZone,
      wakeIntensity,
      callType: 'initial',
      retryCount: 0,
      customMessage: user.customMessage,
      todayLabel,
      currentTimeLabel,
      currentIsoTime,
      schedule: schedules,
      news: newsInfo,
      weather: weatherInfo,
    });

    return prompt;
  }
}
