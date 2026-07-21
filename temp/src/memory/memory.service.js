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
var MemoryService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemoryService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const mongoose_1 = require("@nestjs/mongoose");
const chromadb_1 = require("chromadb");
const mongoose_2 = require("mongoose");
const embeddings_service_1 = require("./embeddings.service");
const memory_schema_1 = require("./schemas/memory.schema");
const user_profile_schema_1 = require("./schemas/user-profile.schema");
let MemoryService = MemoryService_1 = class MemoryService {
    constructor(memoryModel, userProfileModel, embeddingsService, configService) {
        this.memoryModel = memoryModel;
        this.userProfileModel = userProfileModel;
        this.embeddingsService = embeddingsService;
        this.configService = configService;
        this.logger = new common_1.Logger(MemoryService_1.name);
        this.collectionName = 'haru_long_term_memories';
        if (this.embeddingsService.isEnabled()) {
            const chromaUrl = this.configService.get('CHROMA_URL') || 'http://localhost:8000';
            this.chromaClient = new chromadb_1.ChromaClient({ path: chromaUrl });
            void this.initializeChromaCollection();
        }
        else {
            this.chromaClient = null;
        }
    }
    async initializeChromaCollection() {
        if (!this.isVectorStoreEnabled()) {
            return;
        }
        try {
            const chromaClient = this.chromaClient;
            if (!chromaClient) {
                return;
            }
            await chromaClient.getOrCreateCollection({
                name: this.collectionName,
                metadata: { description: 'Haru long-term memory vectors' },
            });
            this.logger.log(`ChromaDB collection '${this.collectionName}' initialized`);
        }
        catch (error) {
            this.logger.error(`Failed to initialize ChromaDB collection: ${error.message}`, error.stack);
        }
    }
    isVectorStoreEnabled() {
        return this.chromaClient !== null && this.embeddingsService.isEnabled();
    }
    getUserObjectId(userId) {
        if (!mongoose_2.Types.ObjectId.isValid(userId)) {
            throw new Error(`Invalid userId: ${userId}`);
        }
        return new mongoose_2.Types.ObjectId(userId);
    }
    normalizeMemoryText(text) {
        return text.replace(/\s+/g, ' ').trim().toLowerCase();
    }
    compactSummary(text, maxLength = 220) {
        const compact = text.replace(/\s+/g, ' ').trim();
        if (compact.length <= maxLength) {
            return compact;
        }
        return `${compact.slice(0, maxLength - 1)}…`;
    }
    sanitizeTags(tags) {
        if (!(tags === null || tags === void 0 ? void 0 : tags.length)) {
            return [];
        }
        return Array.from(new Set(tags
            .map((tag) => tag === null || tag === void 0 ? void 0 : tag.trim())
            .filter((tag) => Boolean(tag))));
    }
    async getCollection() {
        if (!this.isVectorStoreEnabled()) {
            return null;
        }
        const chromaClient = this.chromaClient;
        if (!chromaClient) {
            return null;
        }
        return chromaClient.getCollection({
            name: this.collectionName,
        });
    }
    async addMemoryToVectorStore(memory) {
        if (!this.isVectorStoreEnabled()) {
            return;
        }
        const collection = await this.getCollection();
        if (!collection) {
            return;
        }
        try {
            const embedding = await this.embeddingsService.generateEmbedding(memory.content);
            await collection.add({
                ids: [memory._id.toString()],
                embeddings: [embedding],
                documents: [memory.content],
                metadatas: [
                    {
                        userId: memory.userId.toString(),
                        conversationId: memory.conversationId,
                        memoryType: memory.memoryType,
                        timestamp: memory.timestamp.toISOString(),
                    },
                ],
            });
            memory.chromaId = memory._id.toString();
            await memory.save();
        }
        catch (error) {
            this.logger.error(`Failed to save memory to ChromaDB: ${error.message}`, error.stack);
        }
    }
    async removeMemoryFromVectorStore(chromaId) {
        if (!this.isVectorStoreEnabled() || !chromaId) {
            return;
        }
        try {
            const collection = await this.getCollection();
            if (!collection) {
                return;
            }
            await collection.delete({
                ids: [chromaId],
            });
        }
        catch (error) {
            this.logger.error(`Failed to delete memory from ChromaDB: ${error.message}`, error.stack);
        }
    }
    async fallbackSearchMemories(userId, query, limit) {
        const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const tokens = query
            .split(/\s+/)
            .map((token) => token.trim())
            .filter((token) => token.length > 1);
        const conditions = tokens.length
            ? tokens.map((token) => ({
                content: {
                    $regex: token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
                    $options: 'i',
                },
            }))
            : [{ content: { $regex: escapedQuery, $options: 'i' } }];
        return this.memoryModel
            .find({
            userId: this.getUserObjectId(userId),
            memoryType: 'long_term_memory',
            $or: conditions,
        })
            .sort({ timestamp: -1 })
            .limit(limit)
            .exec();
    }
    async saveCallRecord(dto) {
        var _a;
        const userObjectId = this.getUserObjectId(dto.userId);
        const transcript = dto.transcript.trim();
        const timestamp = dto.endedAt ? new Date(dto.endedAt) : new Date();
        const savedRecord = await this.memoryModel.findOneAndUpdate({
            userId: userObjectId,
            conversationId: dto.conversationId,
            memoryType: 'call_record',
        }, {
            $set: {
                role: 'system',
                memoryType: 'call_record',
                content: transcript,
                summary: this.compactSummary(dto.summary || transcript),
                metadata: Object.assign({ type: 'call_record', startedAt: dto.startedAt || null, endedAt: dto.endedAt || null, messageCount: (_a = dto.messageCount) !== null && _a !== void 0 ? _a : 0 }, (dto.metadata || {})),
                timestamp,
                normalizedContent: null,
            },
        }, {
            upsert: true,
            new: true,
            setDefaultsOnInsert: true,
        });
        this.logger.log(`Call record saved for user ${dto.userId}, conversation ${dto.conversationId}`);
        return savedRecord;
    }
    async saveLongTermMemories(dto) {
        var _a, _b;
        const userObjectId = this.getUserObjectId(dto.userId);
        const cleanedMemories = new Map();
        for (const memory of dto.memories || []) {
            const content = (_a = memory.content) === null || _a === void 0 ? void 0 : _a.replace(/\s+/g, ' ').trim();
            if (!content) {
                continue;
            }
            const normalized = this.normalizeMemoryText(content);
            if (!normalized) {
                continue;
            }
            cleanedMemories.set(normalized, {
                content,
                tags: this.sanitizeTags(memory.tags),
                importance: memory.importance || 'medium',
            });
        }
        if (!cleanedMemories.size) {
            return {
                savedCount: 0,
                updatedCount: 0,
                skippedCount: 0,
            };
        }
        const existingMemories = await this.memoryModel
            .find({
            userId: userObjectId,
            memoryType: 'long_term_memory',
            normalizedContent: { $in: Array.from(cleanedMemories.keys()) },
        })
            .exec();
        const existingByNormalized = new Map(existingMemories.map((memory) => [
            memory.normalizedContent || this.normalizeMemoryText(memory.content),
            memory,
        ]));
        let savedCount = 0;
        let updatedCount = 0;
        for (const [normalizedContent, memory] of cleanedMemories.entries()) {
            const existing = existingByNormalized.get(normalizedContent);
            const tags = this.sanitizeTags(memory.tags);
            if (existing) {
                existing.content = memory.content;
                existing.summary = memory.content;
                existing.conversationId = dto.conversationId;
                existing.timestamp = new Date();
                existing.metadata = Object.assign(Object.assign({}, (existing.metadata || {})), { type: 'long_term_memory', importance: memory.importance || 'medium', tags: this.sanitizeTags([
                        ...(((_b = existing.metadata) === null || _b === void 0 ? void 0 : _b.tags) || []),
                        ...tags,
                    ]), sourceConversationId: dto.conversationId, lastConfirmedAt: new Date().toISOString() });
                await existing.save();
                updatedCount += 1;
                continue;
            }
            const createdMemory = await new this.memoryModel({
                userId: userObjectId,
                conversationId: dto.conversationId,
                memoryType: 'long_term_memory',
                role: 'system',
                content: memory.content,
                summary: memory.content,
                metadata: {
                    type: 'long_term_memory',
                    importance: memory.importance || 'medium',
                    tags,
                    sourceConversationId: dto.conversationId,
                    createdBy: 'transcript_analysis',
                    lastConfirmedAt: new Date().toISOString(),
                },
                normalizedContent,
                timestamp: new Date(),
            }).save();
            await this.addMemoryToVectorStore(createdMemory);
            savedCount += 1;
        }
        return {
            savedCount,
            updatedCount,
            skippedCount: Math.max(0, (dto.memories || []).length - savedCount - updatedCount),
        };
    }
    async getRecentCallRecords(userId, limit = 10) {
        return this.memoryModel
            .find({
            userId: this.getUserObjectId(userId),
            memoryType: 'call_record',
        })
            .select('summary timestamp conversationId metadata')
            .sort({ timestamp: -1 })
            .limit(limit)
            .exec();
    }
    async getConversationMemories(conversationId) {
        return this.memoryModel
            .find({
            conversationId,
            memoryType: 'call_record',
        })
            .sort({ timestamp: 1 })
            .exec();
    }
    async searchMemories(userId, query, limit = 5) {
        var _a;
        if (!query.trim()) {
            return [];
        }
        if (!this.isVectorStoreEnabled()) {
            this.logger.warn('Vector search is disabled. Falling back to Mongo text matching.');
            return this.fallbackSearchMemories(userId, query, limit);
        }
        try {
            const queryEmbedding = await this.embeddingsService.generateEmbedding(query);
            const collection = await this.getCollection();
            if (!collection) {
                return this.fallbackSearchMemories(userId, query, limit);
            }
            const results = await collection.query({
                queryEmbeddings: [queryEmbedding],
                nResults: limit * 3,
                where: {
                    $and: [{ userId }, { memoryType: 'long_term_memory' }],
                },
            });
            const ids = ((_a = results.ids) === null || _a === void 0 ? void 0 : _a[0]) || [];
            if (!ids.length) {
                return [];
            }
            const orderedResults = ids.map((id) => ({
                id,
            }));
            const memoryIds = orderedResults
                .filter((result) => mongoose_2.Types.ObjectId.isValid(result.id))
                .map((result) => new mongoose_2.Types.ObjectId(result.id));
            if (!memoryIds.length) {
                return [];
            }
            const memories = await this.memoryModel
                .find({
                _id: { $in: memoryIds },
                userId: this.getUserObjectId(userId),
                memoryType: 'long_term_memory',
            })
                .exec();
            const memoryMap = new Map(memories.map((memory) => [memory._id.toString(), memory]));
            return orderedResults
                .map((result) => memoryMap.get(result.id))
                .filter(Boolean)
                .slice(0, limit);
        }
        catch (error) {
            this.logger.error(`Failed to search memories: ${error.message}`, error.stack);
            return this.fallbackSearchMemories(userId, query, limit);
        }
    }
    async deleteUserMemories(userId) {
        const userObjectId = this.getUserObjectId(userId);
        const memories = await this.memoryModel
            .find({ userId: userObjectId })
            .select('_id chromaId')
            .exec();
        for (const memory of memories) {
            await this.removeMemoryFromVectorStore(memory.chromaId);
        }
        const deleteResult = await this.memoryModel.deleteMany({
            userId: userObjectId,
        });
        const profileDeleteResult = await this.userProfileModel.deleteOne({
            userId: userObjectId,
        });
        this.logger.log(`Deleted ${deleteResult.deletedCount} memories for user ${userId}`);
        return {
            deletedCount: deleteResult.deletedCount,
            deletedUserInfo: profileDeleteResult.deletedCount > 0,
        };
    }
    async saveUserInfo(dto) {
        const userObjectId = this.getUserObjectId(dto.userId);
        const userProfile = await this.userProfileModel.findOneAndUpdate({ userId: userObjectId }, {
            $set: {
                [`profile.${dto.key}`]: dto.value,
                updatedAt: new Date(),
            },
        }, { upsert: true, new: true });
        this.logger.log(`User info saved: ${dto.key} = ${dto.value} for user ${dto.userId}`);
        return userProfile;
    }
    async getUserInfo(userId) {
        const userProfile = await this.userProfileModel.findOne({
            userId: this.getUserObjectId(userId),
        });
        if (!userProfile) {
            return {};
        }
        return Object.fromEntries(userProfile.profile);
    }
    async updateBehaviorProfile(userId, patch) {
        const userObjectId = this.getUserObjectId(userId);
        const updateFields = {
            updatedAt: new Date(),
        };
        if (patch.wakeStyle) {
            updateFields['profile.wakeStyle'] = patch.wakeStyle;
        }
        if (typeof patch.retryLimit === 'number') {
            updateFields['profile.retryLimit'] = String(patch.retryLimit);
        }
        if (patch.toneNotes) {
            updateFields['profile.toneNotes'] = JSON.stringify(patch.toneNotes);
        }
        await this.userProfileModel.findOneAndUpdate({ userId: userObjectId }, { $set: updateFields }, { upsert: true, new: true });
        return this.getUserInfo(userId);
    }
    async deleteUserInfo(userId, key) {
        const result = await this.userProfileModel.updateOne({ userId: this.getUserObjectId(userId) }, {
            $unset: {
                [`profile.${key}`]: '',
            },
            $set: {
                updatedAt: new Date(),
            },
        });
        return {
            success: result.modifiedCount > 0,
        };
    }
    async getContext(userId) {
        const userObjectId = this.getUserObjectId(userId);
        const [userInfo, longTermMemories, longTermMemoryCount, callRecordCount] = await Promise.all([
            this.getUserInfo(userId),
            this.memoryModel
                .find({
                userId: userObjectId,
                memoryType: 'long_term_memory',
            })
                .sort({ timestamp: -1 })
                .limit(8)
                .exec(),
            this.memoryModel.countDocuments({
                userId: userObjectId,
                memoryType: 'long_term_memory',
            }),
            this.memoryModel.countDocuments({
                userId: userObjectId,
                memoryType: 'call_record',
            }),
        ]);
        return {
            userInfo,
            longTermMemories,
            longTermMemoryCount,
            callRecordCount,
        };
    }
    async getAllMemories(userId, limit = 100) {
        return this.memoryModel
            .find({ userId: this.getUserObjectId(userId) })
            .sort({ timestamp: -1 })
            .limit(limit)
            .exec();
    }
    async deleteMemory(memoryId) {
        const memory = await this.memoryModel.findById(memoryId).exec();
        if (!memory) {
            return { success: false };
        }
        await this.removeMemoryFromVectorStore(memory.chromaId);
        await this.memoryModel.deleteOne({ _id: memory._id });
        return { success: true };
    }
    async saveReminder(dto) {
        const reminder = await new this.memoryModel({
            userId: this.getUserObjectId(dto.userId),
            conversationId: 'reminder_session',
            memoryType: 'reminder',
            role: 'system',
            content: dto.content,
            summary: `리마인더: ${dto.content}`,
            metadata: {
                type: 'reminder',
                priority: dto.priority || 'normal',
                isCompleted: false,
                createdAt: new Date().toISOString(),
                completedAt: null,
            },
            normalizedContent: null,
            timestamp: new Date(),
        }).save();
        this.logger.log(`Reminder saved: ${reminder._id} - ${dto.content}`);
        return reminder;
    }
    async getReminders(userId) {
        return this.memoryModel
            .find({
            userId: this.getUserObjectId(userId),
            $or: [{ memoryType: 'reminder' }, { 'metadata.type': 'reminder' }],
            'metadata.isCompleted': false,
        })
            .sort({ 'metadata.priority': -1, timestamp: -1 })
            .exec();
    }
    async completeReminder(reminderId) {
        const result = await this.memoryModel.updateOne({
            _id: new mongoose_2.Types.ObjectId(reminderId),
            $or: [{ memoryType: 'reminder' }, { 'metadata.type': 'reminder' }],
        }, {
            $set: {
                'metadata.isCompleted': true,
                'metadata.completedAt': new Date().toISOString(),
            },
        });
        return {
            success: result.modifiedCount > 0,
        };
    }
    async deleteReminder(reminderId) {
        const reminder = await this.memoryModel.findOne({
            _id: new mongoose_2.Types.ObjectId(reminderId),
            $or: [{ memoryType: 'reminder' }, { 'metadata.type': 'reminder' }],
        });
        if (!reminder) {
            return { success: false };
        }
        await this.memoryModel.deleteOne({ _id: reminder._id });
        return { success: true };
    }
};
MemoryService = MemoryService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(memory_schema_1.Memory.name)),
    __param(1, (0, mongoose_1.InjectModel)(user_profile_schema_1.UserProfile.name)),
    __metadata("design:paramtypes", [mongoose_2.Model,
        mongoose_2.Model,
        embeddings_service_1.EmbeddingsService,
        config_1.ConfigService])
], MemoryService);
exports.MemoryService = MemoryService;
//# sourceMappingURL=memory.service.js.map