type Schedule = {
    id: string;
    summary: string;
    description?: string;
    start: string;
    end: string;
    location?: string;
};
type PromptOptions = {
    name: string;
    assistantName: string;
    language: string;
    timeZone: string;
    wakeIntensity: string;
    callType: 'initial' | 'retry';
    retryCount: number;
    retryCallsRemaining: number;
    lastWakeStatus?: 'awake' | 'not_awake' | 'retry_requested' | 'no_response' | 'rejected' | null;
    todayLabel: string;
    currentTimeLabel: string;
    currentIsoTime: string;
    weather: string;
    schedule: Schedule[];
    customMessage: string;
};
export declare function buildMorningCallPrompt({ name, assistantName, language, timeZone, wakeIntensity, callType, retryCount, retryCallsRemaining, lastWakeStatus, todayLabel, currentTimeLabel, currentIsoTime, weather, schedule, customMessage, }: PromptOptions): string;
export {};
