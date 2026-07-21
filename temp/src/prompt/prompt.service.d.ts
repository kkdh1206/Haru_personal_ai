import { AlarmService } from 'src/alarm/alarm.service';
import { CalendarService } from 'src/calendar/calendar.service';
import { InformationService } from 'src/information/information.service';
export declare class PromptService {
    private readonly alarmService;
    private readonly calendarService;
    private readonly informationService;
    constructor(alarmService: AlarmService, calendarService: CalendarService, informationService: InformationService);
    private getMaxDailyRetryCalls;
    private formatScheduleTime;
    private normalizeSchedules;
    private formatWeatherInfo;
    private formatWeatherNumber;
    private formatWeatherObservedAt;
    getPrompt(alarmId: string, callType?: 'initial' | 'retry', retryCount?: number): Promise<string>;
    getTestCallPrompt(user: any, wakeIntensity?: string, assistantName?: string): Promise<string>;
}
