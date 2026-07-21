export declare class CreateCalendarEventDto {
    userId: string;
    title: string;
    startTime: string;
    endTime?: string;
    description?: string;
    location?: string;
    allDay?: boolean;
    timeZone?: string;
}
