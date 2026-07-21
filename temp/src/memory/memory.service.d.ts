import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';
import { SaveCallRecordDto } from './dto/save-call-record.dto';
import { UpsertLongTermMemoriesDto } from './dto/upsert-long-term-memories.dto';
import { EmbeddingsService } from './embeddings.service';
import { SaveReminderDto } from './dto/save-reminder.dto';
import { SaveUserInfoDto } from './dto/save-user-info.dto';
import { MemoryDocument } from './schemas/memory.schema';
import { UserProfileDocument } from './schemas/user-profile.schema';
type BehaviorProfilePatch = {
    wakeStyle?: 'gentle' | 'aggressive';
    retryLimit?: number;
    toneNotes?: string[];
};
export declare class MemoryService {
    private memoryModel;
    private userProfileModel;
    private embeddingsService;
    private configService;
    private readonly logger;
    private readonly collectionName;
    private readonly chromaClient;
    constructor(memoryModel: Model<MemoryDocument>, userProfileModel: Model<UserProfileDocument>, embeddingsService: EmbeddingsService, configService: ConfigService);
    private initializeChromaCollection;
    private isVectorStoreEnabled;
    private getUserObjectId;
    private normalizeMemoryText;
    private compactSummary;
    private sanitizeTags;
    private getCollection;
    private addMemoryToVectorStore;
    private removeMemoryFromVectorStore;
    private fallbackSearchMemories;
    saveCallRecord(dto: SaveCallRecordDto): Promise<MemoryDocument>;
    saveLongTermMemories(dto: UpsertLongTermMemoriesDto): Promise<{
        savedCount: number;
        updatedCount: number;
        skippedCount: number;
    }>;
    getRecentCallRecords(userId: string, limit?: number): Promise<MemoryDocument[]>;
    getConversationMemories(conversationId: string): Promise<MemoryDocument[]>;
    searchMemories(userId: string, query: string, limit?: number): Promise<MemoryDocument[]>;
    deleteUserMemories(userId: string): Promise<{
        deletedCount: number;
        deletedUserInfo: boolean;
    }>;
    saveUserInfo(dto: SaveUserInfoDto): Promise<UserProfileDocument>;
    getUserInfo(userId: string): Promise<Record<string, any>>;
    updateBehaviorProfile(userId: string, patch: BehaviorProfilePatch): Promise<Record<string, any>>;
    deleteUserInfo(userId: string, key: string): Promise<{
        success: boolean;
    }>;
    getContext(userId: string): Promise<{
        userInfo: Record<string, any>;
        longTermMemories: MemoryDocument[];
        longTermMemoryCount: number;
        callRecordCount: number;
    }>;
    getAllMemories(userId: string, limit?: number): Promise<MemoryDocument[]>;
    deleteMemory(memoryId: string): Promise<{
        success: boolean;
    }>;
    saveReminder(dto: SaveReminderDto): Promise<MemoryDocument>;
    getReminders(userId: string): Promise<MemoryDocument[]>;
    completeReminder(reminderId: string): Promise<{
        success: boolean;
    }>;
    deleteReminder(reminderId: string): Promise<{
        success: boolean;
    }>;
}
export {};
