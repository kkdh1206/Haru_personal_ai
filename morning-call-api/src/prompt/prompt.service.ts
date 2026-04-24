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

  async getPrompt(alarmId: string) {
    const alarm: any = await this.alarmService.getAlarmWithUser(alarmId);
    if (!alarm?.user) {
      throw new Error(`Alarm user not found for alarm ${alarmId}`);
    }

    const user: any = alarm.user;
    const todayLabel = DateTime.now()
      .setZone(user.timeZone || 'Asia/Seoul')
      .toFormat('yyyy년 MM월 dd일 cccc');

    // 1. 구글 캘린더 일정 조회
    const schedules = await this.calendarService.getTodayEvents(user._id);

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
      ? `${weather.weather}, 기온: ${weather.temperature}, 체감기온: ${weather.feels_like}, 위치: ${weather.city}`
      : '정보 없음';

    // 3. 일정, 뉴스, 날씨를 바탕으로 프롬프트 구성
    const prompt = buildMorningCallPrompt({
      name: user.name,
      language: user.language,
      wakeIntensity: alarm.wakeIntensity,
      customMessage: user.customMessage,
      todayLabel,
      schedule: schedules,
      news: newsInfo,
      weather: weatherInfo,
    });

    return prompt;
  }

  async getTestCallPrompt(user, wakeIntensity = 'gentle') {
    const todayLabel = DateTime.now()
      .setZone(user.timeZone || 'Asia/Seoul')
      .toFormat('yyyy년 MM월 dd일 cccc');

    // 1. 구글 캘린더 일정 조회
    const schedules = await this.calendarService.getTodayEvents(user._id);

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
      ? `${weather.weather}, 기온: ${weather.temperature}, 체감기온: ${weather.feels_like}, 위치: ${weather.city}`
      : '정보 없음';

    // 3. 일정, 뉴스, 날씨를 바탕으로 프롬프트 구성
    const prompt = buildMorningCallPrompt({
      name: user.name,
      language: user.language,
      wakeIntensity,
      customMessage: user.customMessage,
      todayLabel,
      schedule: schedules,
      news: newsInfo,
      weather: weatherInfo,
    });

    return prompt;
  }
}
