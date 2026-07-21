"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var MemoryController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemoryController = void 0;
const common_1 = require("@nestjs/common");
const save_call_record_dto_1 = require("./dto/save-call-record.dto");
const save_reminder_dto_1 = require("./dto/save-reminder.dto");
const save_user_info_dto_1 = require("./dto/save-user-info.dto");
const upsert_long_term_memories_dto_1 = require("./dto/upsert-long-term-memories.dto");
const memory_service_1 = require("./memory.service");
let MemoryController = MemoryController_1 = class MemoryController {
    constructor(memoryService) {
        this.memoryService = memoryService;
        this.logger = new common_1.Logger(MemoryController_1.name);
    }
    async saveCallRecord(dto) {
        this.logger.log(`Saving call record for user ${dto.userId}, conversation ${dto.conversationId}`);
        const record = await this.memoryService.saveCallRecord(dto);
        return {
            success: true,
            message: 'Call record saved successfully',
            data: {
                id: record._id,
                userId: record.userId,
                conversationId: record.conversationId,
                timestamp: record.timestamp,
            },
        };
    }
    async saveLongTermMemories(dto) {
        var _a;
        this.logger.log(`Saving ${((_a = dto.memories) === null || _a === void 0 ? void 0 : _a.length) || 0} long-term memories for user ${dto.userId}`);
        const result = await this.memoryService.saveLongTermMemories(dto);
        return {
            success: true,
            message: 'Long-term memories processed successfully',
            data: result,
        };
    }
    async getRecentCallRecords(userId, limit) {
        this.logger.log(`Fetching recent call records for user ${userId}`);
        if (!userId) {
            return {
                success: false,
                message: 'userId is required',
                data: [],
            };
        }
        const limitNum = limit ? parseInt(limit, 10) : 10;
        const memories = await this.memoryService.getRecentCallRecords(userId, limitNum);
        return {
            success: true,
            message: `Retrieved ${memories.length} recent call records`,
            data: memories,
        };
    }
    async getConversationMemories(conversationId) {
        this.logger.log(`Fetching call record for conversation ${conversationId}`);
        const memories = await this.memoryService.getConversationMemories(conversationId);
        return {
            success: true,
            message: `Retrieved ${memories.length} conversation records`,
            data: memories,
        };
    }
    async searchMemories(userId, query, legacyQuery, limit) {
        const resolvedQuery = query || legacyQuery || '';
        this.logger.log(`Searching memories for user ${userId}, query: "${resolvedQuery}"`);
        if (!userId || !resolvedQuery) {
            return {
                success: false,
                message: 'userId and q are required',
                data: [],
            };
        }
        const limitNum = limit ? parseInt(limit, 10) : 5;
        const memories = await this.memoryService.searchMemories(userId, resolvedQuery, limitNum);
        return {
            success: true,
            message: `Found ${memories.length} relevant memories`,
            data: memories,
        };
    }
    async deleteUserMemories(userId) {
        this.logger.log(`Deleting all memories for user ${userId}`);
        const result = await this.memoryService.deleteUserMemories(userId);
        return {
            success: true,
            message: `Deleted ${result.deletedCount} memories`,
            data: result,
        };
    }
    async saveUserInfo(dto) {
        this.logger.log(`Saving user info: ${dto.key} = ${dto.value} for user ${dto.userId}`);
        const userProfile = await this.memoryService.saveUserInfo(dto);
        return {
            success: true,
            message: 'User info saved successfully',
            data: {
                userId: userProfile.userId,
                key: dto.key,
                value: dto.value,
            },
        };
    }
    async getUserInfo(userId) {
        this.logger.log(`Fetching user info for user ${userId}`);
        const userInfo = await this.memoryService.getUserInfo(userId);
        return {
            success: true,
            message: 'User info retrieved successfully',
            data: userInfo,
        };
    }
    async deleteUserInfo(userId, key) {
        this.logger.log(`Deleting user info key ${key} for user ${userId}`);
        const result = await this.memoryService.deleteUserInfo(userId, key);
        return {
            success: result.success,
            message: result.success
                ? 'User info deleted successfully'
                : 'User info not found',
            data: result,
        };
    }
    async getContext(userId) {
        this.logger.log(`Fetching context for user ${userId}`);
        if (!userId) {
            return {
                success: false,
                message: 'userId is required',
                data: null,
            };
        }
        const context = await this.memoryService.getContext(userId);
        return {
            success: true,
            message: 'Context retrieved successfully',
            data: context,
        };
    }
    async getAllMemories(userId, limit) {
        this.logger.log(`Fetching all memories for user ${userId}`);
        if (!userId) {
            return {
                success: false,
                message: 'userId is required',
                data: [],
            };
        }
        const limitNum = limit ? parseInt(limit, 10) : 100;
        const memories = await this.memoryService.getAllMemories(userId, limitNum);
        return {
            success: true,
            message: `Retrieved ${memories.length} total memories`,
            data: memories,
        };
    }
    async deleteMemory(memoryId) {
        this.logger.log(`Deleting memory ${memoryId}`);
        const result = await this.memoryService.deleteMemory(memoryId);
        return {
            success: result.success,
            message: result.success
                ? 'Memory deleted successfully'
                : 'Memory not found',
            data: result,
        };
    }
    async saveReminder(dto) {
        this.logger.log(`Saving reminder for user ${dto.userId}: ${dto.content}`);
        const reminder = await this.memoryService.saveReminder(dto);
        return {
            success: true,
            message: 'Reminder saved successfully',
            data: {
                id: reminder._id,
                content: reminder.content,
                priority: reminder.metadata['priority'],
            },
        };
    }
    async getReminders(userId) {
        this.logger.log(`Fetching reminders for user ${userId}`);
        if (!userId) {
            return {
                success: false,
                message: 'userId is required',
                data: [],
            };
        }
        const reminders = await this.memoryService.getReminders(userId);
        return {
            success: true,
            message: `Retrieved ${reminders.length} active reminders`,
            data: reminders,
        };
    }
    async completeReminder(reminderId) {
        this.logger.log(`Completing reminder ${reminderId}`);
        const result = await this.memoryService.completeReminder(reminderId);
        return {
            success: result.success,
            message: result.success ? 'Reminder completed' : 'Reminder not found',
            data: result,
        };
    }
    async deleteReminder(reminderId) {
        this.logger.log(`Deleting reminder ${reminderId}`);
        const result = await this.memoryService.deleteReminder(reminderId);
        return {
            success: result.success,
            message: result.success
                ? 'Reminder deleted successfully'
                : 'Reminder not found',
            data: result,
        };
    }
};
__decorate([
    (0, common_1.Post)('call-record'),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [save_call_record_dto_1.SaveCallRecordDto]),
    __metadata("design:returntype", Promise)
], MemoryController.prototype, "saveCallRecord", null);
__decorate([
    (0, common_1.Post)('long-term'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [upsert_long_term_memories_dto_1.UpsertLongTermMemoriesDto]),
    __metadata("design:returntype", Promise)
], MemoryController.prototype, "saveLongTermMemories", null);
__decorate([
    (0, common_1.Get)('recent'),
    __param(0, (0, common_1.Query)('userId')),
    __param(1, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], MemoryController.prototype, "getRecentCallRecords", null);
__decorate([
    (0, common_1.Get)('conversation/:conversationId'),
    __param(0, (0, common_1.Param)('conversationId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], MemoryController.prototype, "getConversationMemories", null);
__decorate([
    (0, common_1.Get)('search'),
    __param(0, (0, common_1.Query)('userId')),
    __param(1, (0, common_1.Query)('q')),
    __param(2, (0, common_1.Query)('query')),
    __param(3, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", Promise)
], MemoryController.prototype, "searchMemories", null);
__decorate([
    (0, common_1.Delete)('user/:userId'),
    __param(0, (0, common_1.Param)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], MemoryController.prototype, "deleteUserMemories", null);
__decorate([
    (0, common_1.Post)('user-info'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [save_user_info_dto_1.SaveUserInfoDto]),
    __metadata("design:returntype", Promise)
], MemoryController.prototype, "saveUserInfo", null);
__decorate([
    (0, common_1.Get)('user-info/:userId'),
    __param(0, (0, common_1.Param)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], MemoryController.prototype, "getUserInfo", null);
__decorate([
    (0, common_1.Delete)('user-info/:userId/:key'),
    __param(0, (0, common_1.Param)('userId')),
    __param(1, (0, common_1.Param)('key')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], MemoryController.prototype, "deleteUserInfo", null);
__decorate([
    (0, common_1.Get)('context'),
    __param(0, (0, common_1.Query)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], MemoryController.prototype, "getContext", null);
__decorate([
    (0, common_1.Get)('all'),
    __param(0, (0, common_1.Query)('userId')),
    __param(1, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], MemoryController.prototype, "getAllMemories", null);
__decorate([
    (0, common_1.Delete)(':memoryId'),
    __param(0, (0, common_1.Param)('memoryId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], MemoryController.prototype, "deleteMemory", null);
__decorate([
    (0, common_1.Post)('reminder'),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [save_reminder_dto_1.SaveReminderDto]),
    __metadata("design:returntype", Promise)
], MemoryController.prototype, "saveReminder", null);
__decorate([
    (0, common_1.Get)('reminders'),
    __param(0, (0, common_1.Query)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], MemoryController.prototype, "getReminders", null);
__decorate([
    (0, common_1.Patch)('reminder/:id/complete'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], MemoryController.prototype, "completeReminder", null);
__decorate([
    (0, common_1.Delete)('reminder/:id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], MemoryController.prototype, "deleteReminder", null);
MemoryController = MemoryController_1 = __decorate([
    (0, common_1.Controller)('memory'),
    __metadata("design:paramtypes", [memory_service_1.MemoryService])
], MemoryController);
exports.MemoryController = MemoryController;
//# sourceMappingURL=memory.controller.js.map