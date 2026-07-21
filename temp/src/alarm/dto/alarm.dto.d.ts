export declare class AlarmDto {
    personality?: string;
    voice?: string;
    role?: string;
    wakeIntensity?: 'gentle' | 'firm';
    time: string;
    targetDate?: string;
    timeZone: string;
    isOn: boolean;
    repeatDays: number[];
}
