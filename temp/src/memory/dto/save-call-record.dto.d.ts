export declare class SaveCallRecordDto {
    userId: string;
    conversationId: string;
    transcript: string;
    summary?: string;
    startedAt?: string;
    endedAt?: string;
    messageCount?: number;
    metadata?: Record<string, any>;
}
