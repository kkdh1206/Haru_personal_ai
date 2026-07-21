export declare class ReportCallOutcomeDto {
    alarmId: string;
    callType: 'initial' | 'retry';
    retryCount?: number;
    wakeStatus: 'awake' | 'not_awake' | 'retry_requested' | 'no_response' | 'rejected';
    hadUserResponse?: boolean;
    retryMinutes?: number;
}
