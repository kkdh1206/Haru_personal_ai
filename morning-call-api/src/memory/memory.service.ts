import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { ChromaClient } from 'chromadb';
import { Model, Types } from 'mongoose';
import { SaveCallRecordDto } from './dto/save-call-record.dto';
import {
  LongTermMemoryItemDto,
  UpsertLongTermMemoriesDto,
} from './dto/upsert-long-term-memories.dto';
import { EmbeddingsService } from './embeddings.service';
import { SaveReminderDto } from './dto/save-reminder.dto';
import { SaveUserInfoDto } from './dto/save-user-info.dto';
import { Memory, MemoryDocument } from './schemas/memory.schema';
import {
  UserProfile,
  UserProfileDocument,
} from './schemas/user-profile.schema';

type LongTermMemorySearchResult = {
  id: string;
};

type BehaviorProfilePatch = {
  wakeStyle?: 'gentle' | 'aggressive';
  retryLimit?: number;
  toneNotes?: string[];
};

@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name);
  private readonly collectionName = 'haru_long_term_memories';
  private readonly chromaClient: ChromaClient | null;

  constructor(
    @InjectModel(Memory.name) private memoryModel: Model<MemoryDocument>,
    @InjectModel(UserProfile.name)
    private userProfileModel: Model<UserProfileDocument>,
    private embeddingsService: EmbeddingsService,
    private configService: ConfigService,
  ) {
    if (this.embeddingsService.isEnabled()) {
      const chromaUrl =
        this.configService.get<string>('CHROMA_URL') || 'http://localhost:8000';
      this.chromaClient = new ChromaClient({ path: chromaUrl });
      void this.initializeChromaCollection();
    } else {
      this.chromaClient = null;
    }
  }

  private async initializeChromaCollection() {
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
      this.logger.log(
        `ChromaDB collection '${this.collectionName}' initialized`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to initialize ChromaDB collection: ${error.message}`,
        error.stack,
      );
    }
  }

  private isVectorStoreEnabled(): boolean {
    return this.chromaClient !== null && this.embeddingsService.isEnabled();
  }

  private getUserObjectId(userId: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(userId)) {
      throw new Error(`Invalid userId: ${userId}`);
    }

    return new Types.ObjectId(userId);
  }

  private normalizeMemoryText(text: string): string {
    return text.replace(/\s+/g, ' ').trim().toLowerCase();
  }

  private compactSummary(text: string, maxLength = 220): string {
    const compact = text.replace(/\s+/g, ' ').trim();
    if (compact.length <= maxLength) {
      return compact;
    }

    return `${compact.slice(0, maxLength - 1)}…`;
  }

  private sanitizeTags(tags?: string[]): string[] {
    if (!tags?.length) {
      return [];
    }

    return Array.from(
      new Set(
        tags
          .map((tag) => tag?.trim())
          .filter((tag): tag is string => Boolean(tag)),
      ),
    );
  }

  private async getCollection() {
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

  private async addMemoryToVectorStore(memory: MemoryDocument) {
    if (!this.isVectorStoreEnabled()) {
      return;
    }

    const collection = await this.getCollection();
    if (!collection) {
      return;
    }

    try {
      const embedding = await this.embeddingsService.generateEmbedding(
        memory.content,
      );

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
    } catch (error) {
      this.logger.error(
        `Failed to save memory to ChromaDB: ${error.message}`,
        error.stack,
      );
    }
  }

  private async removeMemoryFromVectorStore(chromaId?: string | null) {
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
    } catch (error) {
      this.logger.error(
        `Failed to delete memory from ChromaDB: ${error.message}`,
        error.stack,
      );
    }
  }

  private async fallbackSearchMemories(
    userId: string,
    query: string,
    limit: number,
  ): Promise<MemoryDocument[]> {
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

  async saveCallRecord(dto: SaveCallRecordDto): Promise<MemoryDocument> {
    const userObjectId = this.getUserObjectId(dto.userId);
    const transcript = dto.transcript.trim();
    const timestamp = dto.endedAt ? new Date(dto.endedAt) : new Date();

    const savedRecord = await this.memoryModel.findOneAndUpdate(
      {
        userId: userObjectId,
        conversationId: dto.conversationId,
        memoryType: 'call_record',
      },
      {
        $set: {
          role: 'system',
          memoryType: 'call_record',
          content: transcript,
          summary: this.compactSummary(dto.summary || transcript),
          metadata: {
            type: 'call_record',
            startedAt: dto.startedAt || null,
            endedAt: dto.endedAt || null,
            messageCount: dto.messageCount ?? 0,
            ...(dto.metadata || {}),
          },
          timestamp,
          normalizedContent: null,
        },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      },
    );

    this.logger.log(
      `Call record saved for user ${dto.userId}, conversation ${dto.conversationId}`,
    );

    return savedRecord;
  }

  async saveLongTermMemories(dto: UpsertLongTermMemoriesDto): Promise<{
    savedCount: number;
    updatedCount: number;
    skippedCount: number;
  }> {
    const userObjectId = this.getUserObjectId(dto.userId);
    const cleanedMemories = new Map<string, LongTermMemoryItemDto>();

    for (const memory of dto.memories || []) {
      const content = memory.content?.replace(/\s+/g, ' ').trim();
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

    const existingByNormalized = new Map(
      existingMemories.map((memory) => [
        memory.normalizedContent || this.normalizeMemoryText(memory.content),
        memory,
      ]),
    );

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
        existing.metadata = {
          ...(existing.metadata || {}),
          type: 'long_term_memory',
          importance: memory.importance || 'medium',
          tags: this.sanitizeTags([
            ...(existing.metadata?.tags || []),
            ...tags,
          ]),
          sourceConversationId: dto.conversationId,
          lastConfirmedAt: new Date().toISOString(),
        };

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
      skippedCount: Math.max(
        0,
        (dto.memories || []).length - savedCount - updatedCount,
      ),
    };
  }

  async getRecentCallRecords(
    userId: string,
    limit = 10,
  ): Promise<MemoryDocument[]> {
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

  async getConversationMemories(
    conversationId: string,
  ): Promise<MemoryDocument[]> {
    return this.memoryModel
      .find({
        conversationId,
        memoryType: 'call_record',
      })
      .sort({ timestamp: 1 })
      .exec();
  }

  async searchMemories(
    userId: string,
    query: string,
    limit = 5,
  ): Promise<MemoryDocument[]> {
    if (!query.trim()) {
      return [];
    }

    if (!this.isVectorStoreEnabled()) {
      this.logger.warn(
        'Vector search is disabled. Falling back to Mongo text matching.',
      );
      return this.fallbackSearchMemories(userId, query, limit);
    }

    try {
      const queryEmbedding = await this.embeddingsService.generateEmbedding(
        query,
      );
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

      const ids = results.ids?.[0] || [];
      if (!ids.length) {
        return [];
      }

      const orderedResults: LongTermMemorySearchResult[] = ids.map((id) => ({
        id,
      }));

      const memoryIds = orderedResults
        .filter((result) => Types.ObjectId.isValid(result.id))
        .map((result) => new Types.ObjectId(result.id));

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

      const memoryMap = new Map(
        memories.map((memory) => [memory._id.toString(), memory]),
      );

      return orderedResults
        .map((result) => memoryMap.get(result.id))
        .filter(Boolean)
        .slice(0, limit) as MemoryDocument[];
    } catch (error) {
      this.logger.error(
        `Failed to search memories: ${error.message}`,
        error.stack,
      );
      return this.fallbackSearchMemories(userId, query, limit);
    }
  }

  async deleteUserMemories(userId: string): Promise<{
    deletedCount: number;
    deletedUserInfo: boolean;
  }> {
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

    this.logger.log(
      `Deleted ${deleteResult.deletedCount} memories for user ${userId}`,
    );

    return {
      deletedCount: deleteResult.deletedCount,
      deletedUserInfo: profileDeleteResult.deletedCount > 0,
    };
  }

  async saveUserInfo(dto: SaveUserInfoDto): Promise<UserProfileDocument> {
    const userObjectId = this.getUserObjectId(dto.userId);

    const userProfile = await this.userProfileModel.findOneAndUpdate(
      { userId: userObjectId },
      {
        $set: {
          [`profile.${dto.key}`]: dto.value,
          updatedAt: new Date(),
        },
      },
      { upsert: true, new: true },
    );

    this.logger.log(
      `User info saved: ${dto.key} = ${dto.value} for user ${dto.userId}`,
    );

    return userProfile;
  }

  async getUserInfo(userId: string): Promise<Record<string, any>> {
    const userProfile = await this.userProfileModel.findOne({
      userId: this.getUserObjectId(userId),
    });

    if (!userProfile) {
      return {};
    }

    return Object.fromEntries(userProfile.profile);
  }

  async updateBehaviorProfile(
    userId: string,
    patch: BehaviorProfilePatch,
  ): Promise<Record<string, any>> {
    const userObjectId = this.getUserObjectId(userId);
    const updateFields: Record<string, any> = {
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

    await this.userProfileModel.findOneAndUpdate(
      { userId: userObjectId },
      { $set: updateFields },
      { upsert: true, new: true },
    );

    return this.getUserInfo(userId);
  }

  async deleteUserInfo(
    userId: string,
    key: string,
  ): Promise<{ success: boolean }> {
    const result = await this.userProfileModel.updateOne(
      { userId: this.getUserObjectId(userId) },
      {
        $unset: {
          [`profile.${key}`]: '',
        },
        $set: {
          updatedAt: new Date(),
        },
      },
    );

    return {
      success: result.modifiedCount > 0,
    };
  }

  async getContext(userId: string): Promise<{
    userInfo: Record<string, any>;
    longTermMemories: MemoryDocument[];
    longTermMemoryCount: number;
    callRecordCount: number;
  }> {
    const userObjectId = this.getUserObjectId(userId);
    const [userInfo, longTermMemories, longTermMemoryCount, callRecordCount] =
      await Promise.all([
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

  async getAllMemories(userId: string, limit = 100): Promise<MemoryDocument[]> {
    return this.memoryModel
      .find({ userId: this.getUserObjectId(userId) })
      .sort({ timestamp: -1 })
      .limit(limit)
      .exec();
  }

  async deleteMemory(memoryId: string): Promise<{ success: boolean }> {
    const memory = await this.memoryModel.findById(memoryId).exec();

    if (!memory) {
      return { success: false };
    }

    await this.removeMemoryFromVectorStore(memory.chromaId);
    await this.memoryModel.deleteOne({ _id: memory._id });

    return { success: true };
  }

  async saveReminder(dto: SaveReminderDto): Promise<MemoryDocument> {
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

  async getReminders(userId: string): Promise<MemoryDocument[]> {
    return this.memoryModel
      .find({
        userId: this.getUserObjectId(userId),
        $or: [{ memoryType: 'reminder' }, { 'metadata.type': 'reminder' }],
        'metadata.isCompleted': false,
      })
      .sort({ 'metadata.priority': -1, timestamp: -1 })
      .exec();
  }

  async completeReminder(reminderId: string): Promise<{ success: boolean }> {
    const result = await this.memoryModel.updateOne(
      {
        _id: new Types.ObjectId(reminderId),
        $or: [{ memoryType: 'reminder' }, { 'metadata.type': 'reminder' }],
      },
      {
        $set: {
          'metadata.isCompleted': true,
          'metadata.completedAt': new Date().toISOString(),
        },
      },
    );

    return {
      success: result.modifiedCount > 0,
    };
  }

  async deleteReminder(reminderId: string): Promise<{ success: boolean }> {
    const reminder = await this.memoryModel.findOne({
      _id: new Types.ObjectId(reminderId),
      $or: [{ memoryType: 'reminder' }, { 'metadata.type': 'reminder' }],
    });

    if (!reminder) {
      return { success: false };
    }

    await this.memoryModel.deleteOne({ _id: reminder._id });
    return { success: true };
  }
}
