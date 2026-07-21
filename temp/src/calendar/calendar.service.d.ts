import { ConfigService } from '@nestjs/config';
import { UserService } from 'src/user/user.service';
import { CreateCalendarEventDto } from './dto/create-calendar-event.dto';
export declare class CalendarService {
    private readonly userService;
    private readonly cs;
    constructor(userService: UserService, cs: ConfigService);
    private getCalendarErrorMessage;
    private logCalendarError;
    private getCalendarClient;
    private isAllDayValue;
    getTodayEvents(userId: string): Promise<{
        id: string;
        summary: string;
        description: string;
        start: string;
        end: string;
        location: string;
    }[]>;
    getSchedule(userId: string, date: string): Promise<{
        id: string;
        summary: string;
        description: string;
        start: string;
        end: string;
        location: string;
    }[]>;
    createEvent(userId: string, dto: CreateCalendarEventDto): Promise<{
        success: boolean;
        eventId: string;
        htmlLink: string;
        start: string;
        end: any;
        timeZone: string;
        allDay: boolean;
        message?: undefined;
    } | {
        success: boolean;
        message: string;
        eventId?: undefined;
        htmlLink?: undefined;
        start?: undefined;
        end?: undefined;
        timeZone?: undefined;
        allDay?: undefined;
    }>;
}
