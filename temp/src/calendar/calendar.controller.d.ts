import { CalendarService } from './calendar.service';
import { CreateCalendarEventDto } from './dto/create-calendar-event.dto';
export declare class CalendarController {
    private readonly calendarService;
    constructor(calendarService: CalendarService);
    getTodayEvents(req: any): Promise<{
        id: string;
        summary: string;
        description: string;
        start: string;
        end: string;
        location: string;
    }[]>;
    createEvent(dto: CreateCalendarEventDto): Promise<{
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
