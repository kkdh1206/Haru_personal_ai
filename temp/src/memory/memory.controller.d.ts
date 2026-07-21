/// <reference types="mongoose/types/aggregate" />
/// <reference types="mongoose/types/callback" />
/// <reference types="mongoose/types/collection" />
/// <reference types="mongoose/types/connection" />
/// <reference types="mongoose/types/cursor" />
/// <reference types="mongoose/types/document" />
/// <reference types="mongoose/types/error" />
/// <reference types="mongoose/types/expressions" />
/// <reference types="mongoose/types/helpers" />
/// <reference types="mongoose/types/middlewares" />
/// <reference types="mongoose/types/indexes" />
/// <reference types="mongoose/types/models" />
/// <reference types="mongoose/types/mongooseoptions" />
/// <reference types="mongoose/types/pipelinestage" />
/// <reference types="mongoose/types/populate" />
/// <reference types="mongoose/types/query" />
/// <reference types="mongoose/types/schemaoptions" />
/// <reference types="mongoose/types/session" />
/// <reference types="mongoose/types/types" />
/// <reference types="mongoose/types/utility" />
/// <reference types="mongoose/types/validation" />
/// <reference types="mongoose/types/virtuals" />
/// <reference types="mongoose" />
/// <reference types="mongoose/types/schematypes" />
/// <reference types="mongoose/types/inferschematype" />
/// <reference types="mongoose/types/inferrawdoctype" />
import { SaveCallRecordDto } from './dto/save-call-record.dto';
import { SaveReminderDto } from './dto/save-reminder.dto';
import { SaveUserInfoDto } from './dto/save-user-info.dto';
import { UpsertLongTermMemoriesDto } from './dto/upsert-long-term-memories.dto';
import { MemoryService } from './memory.service';
export declare class MemoryController {
    private readonly memoryService;
    private readonly logger;
    constructor(memoryService: MemoryService);
    saveCallRecord(dto: SaveCallRecordDto): Promise<{
        success: boolean;
        message: string;
        data: {
            id: unknown;
            userId: import("mongoose").Types.ObjectId;
            conversationId: string;
            timestamp: Date;
        };
    }>;
    saveLongTermMemories(dto: UpsertLongTermMemoriesDto): Promise<{
        success: boolean;
        message: string;
        data: {
            savedCount: number;
            updatedCount: number;
            skippedCount: number;
        };
    }>;
    getRecentCallRecords(userId: string, limit?: string): Promise<{
        success: boolean;
        message: string;
        data: import("./schemas/memory.schema").MemoryDocument[];
    }>;
    getConversationMemories(conversationId: string): Promise<{
        success: boolean;
        message: string;
        data: import("./schemas/memory.schema").MemoryDocument[];
    }>;
    searchMemories(userId: string, query?: string, legacyQuery?: string, limit?: string): Promise<{
        success: boolean;
        message: string;
        data: import("./schemas/memory.schema").MemoryDocument[];
    }>;
    deleteUserMemories(userId: string): Promise<{
        success: boolean;
        message: string;
        data: {
            deletedCount: number;
            deletedUserInfo: boolean;
        };
    }>;
    saveUserInfo(dto: SaveUserInfoDto): Promise<{
        success: boolean;
        message: string;
        data: {
            userId: import("mongoose").Types.ObjectId;
            key: string;
            value: any;
        };
    }>;
    getUserInfo(userId: string): Promise<{
        success: boolean;
        message: string;
        data: Record<string, any>;
    }>;
    deleteUserInfo(userId: string, key: string): Promise<{
        success: boolean;
        message: string;
        data: {
            success: boolean;
        };
    }>;
    getContext(userId: string): Promise<{
        success: boolean;
        message: string;
        data: {
            userInfo: Record<string, any>;
            longTermMemories: import("./schemas/memory.schema").MemoryDocument[];
            longTermMemoryCount: number;
            callRecordCount: number;
        };
    }>;
    getAllMemories(userId: string, limit?: string): Promise<{
        success: boolean;
        message: string;
        data: import("./schemas/memory.schema").MemoryDocument[];
    }>;
    deleteMemory(memoryId: string): Promise<{
        success: boolean;
        message: string;
        data: {
            success: boolean;
        };
    }>;
    saveReminder(dto: SaveReminderDto): Promise<{
        success: boolean;
        message: string;
        data: {
            id: unknown;
            content: string;
            priority: any;
        };
    }>;
    getReminders(userId: string): Promise<{
        success: boolean;
        message: string;
        data: import("./schemas/memory.schema").MemoryDocument[];
    }>;
    completeReminder(reminderId: string): Promise<{
        success: boolean;
        message: string;
        data: {
            success: boolean;
        };
    }>;
    deleteReminder(reminderId: string): Promise<{
        success: boolean;
        message: string;
        data: {
            success: boolean;
        };
    }>;
}
