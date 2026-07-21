export declare class LongTermMemoryItemDto {
    content: string;
    tags?: string[];
    importance?: 'high' | 'medium';
}
export declare class UpsertLongTermMemoriesDto {
    userId: string;
    conversationId: string;
    memories: LongTermMemoryItemDto[];
}
