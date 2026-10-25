import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { SaveCallRecordDto } from './dto/save-call-record.dto';
import {
  LongTermMemoryItemDto,
  UpsertLongTermMemoriesDto,
} from './dto/upsert-long-term-memories.dto';
import { SaveReminderDto } from './dto/save-reminder.dto';
import { SaveUserInfoDto } from './dto/save-user-info.dto';
import { Memory, MemoryDocument } from './schemas/memory.schema';
import {
  UserProfile,
  UserProfileDocument,
} from './schemas/user-profile.schema';

type BehaviorProfilePatch = {
  wakeStyle?: 'gentle' | 'aggressive';
  retryLimit?: number;
  toneNotes?: string[];
};

export type ReminderPatch = {
  content?: string;
  priority?: 'high' | 'normal';
  dueAt?: string | null;
  completed?: boolean;
};

@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name);

  constructor(
    @InjectModel(Memory.name) private memoryModel: Model<MemoryDocument>,
    @InjectModel(UserProfile.name)
    private userProfileModel: Model<UserProfileDocument>,
  ) {}

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

  // Keep memory retrieval available without an external model or vector store.
  async searchMemories(
    userId: string,
    query: string,
    limit = 5,
  ): Promise<MemoryDocument[]> {
    query = query.replace(/\s+/g, ' ').trim();
    if (!query) {
      return [];
    }

    const tokens: string[] = [];
    const seenTokens = new Set<string>();
    for (const rawToken of query.split(' ')) {
      if (rawToken.length <= 1) continue;
      const token = rawToken.slice(0, 64);
      const normalized = token.toLowerCase();
      if (seenTokens.has(normalized)) continue;
      seenTokens.add(normalized);
      tokens.push(token);
      if (tokens.length >= 16) break;
    }

    const escapedQuery = query
      .slice(0, 64)
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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

      await new this.memoryModel({
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

  async deleteUserMemories(userId: string): Promise<{
    deletedCount: number;
    deletedUserInfo: boolean;
  }> {
    const userObjectId = this.getUserObjectId(userId);
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
        dueAt: dto.dueAt || null,
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

  async getReminders(
    userId: string,
    options: { includeCompleted?: boolean } = {},
  ): Promise<MemoryDocument[]> {
    const filter: Record<string, any> = {
      userId: this.getUserObjectId(userId),
      $or: [{ memoryType: 'reminder' }, { 'metadata.type': 'reminder' }],
    };
    if (!options.includeCompleted) {
      filter['metadata.isCompleted'] = false;
    }

    return this.memoryModel
      .find(filter)
      .sort({
        'metadata.isCompleted': 1,
        'metadata.priority': -1,
        'metadata.dueAt': 1,
        timestamp: -1,
      })
      .exec();
  }

  async updateReminderForUser(
    userId: string,
    reminderId: string,
    patch: ReminderPatch,
  ): Promise<MemoryDocument | null> {
    if (!Types.ObjectId.isValid(reminderId)) {
      return null;
    }

    const $set: Record<string, any> = {};
    if (patch.content !== undefined) {
      $set.content = patch.content;
      $set.summary = `리마인더: ${patch.content}`;
    }
    if (patch.priority !== undefined) {
      $set['metadata.priority'] = patch.priority;
    }
    if (patch.dueAt !== undefined) {
      $set['metadata.dueAt'] = patch.dueAt;
    }
    if (patch.completed !== undefined) {
      $set['metadata.isCompleted'] = patch.completed;
      $set['metadata.completedAt'] = patch.completed
        ? new Date().toISOString()
        : null;
    }

    if (!Object.keys($set).length) {
      return this.memoryModel
        .findOne({
          _id: new Types.ObjectId(reminderId),
          userId: this.getUserObjectId(userId),
          $or: [{ memoryType: 'reminder' }, { 'metadata.type': 'reminder' }],
        })
        .exec();
    }

    return this.memoryModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(reminderId),
        userId: this.getUserObjectId(userId),
        $or: [{ memoryType: 'reminder' }, { 'metadata.type': 'reminder' }],
      },
      { $set },
      { new: true },
    );
  }

  async deleteReminderForUser(
    userId: string,
    reminderId: string,
  ): Promise<{ success: boolean }> {
    if (!Types.ObjectId.isValid(reminderId)) {
      return { success: false };
    }

    const result = await this.memoryModel.deleteOne({
      _id: new Types.ObjectId(reminderId),
      userId: this.getUserObjectId(userId),
      $or: [{ memoryType: 'reminder' }, { 'metadata.type': 'reminder' }],
    });

    return { success: result.deletedCount > 0 };
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
