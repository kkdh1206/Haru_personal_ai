import { Types } from 'mongoose';
import { MemoryService } from './memory.service';

describe('MemoryService without embeddings', () => {
  const userId = '507f1f77bcf86cd799439011';
  let model: any;
  let profile: any;
  let query: any;
  let save: jest.Mock;
  let service: MemoryService;

  beforeEach(() => {
    save = jest.fn().mockResolvedValue({ _id: 'memory-1' });
    model = jest.fn().mockImplementation((data) => ({ ...data, save }));
    query = {
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([]),
    };
    model.find = jest.fn().mockReturnValue(query);
    model.findOne = jest.fn().mockReturnValue(query);
    model.findOneAndUpdate = jest.fn().mockResolvedValue({ _id: 'call-1' });
    model.findById = jest.fn().mockReturnValue(query);
    model.deleteOne = jest.fn().mockResolvedValue({ deletedCount: 1 });
    model.deleteMany = jest.fn().mockResolvedValue({ deletedCount: 2 });
    profile = { deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 }) };
    // No API key, embedding service, or vector client is needed at startup.
    service = new MemoryService(model, profile);
  });

  it('searches only the current user long-term memories with literal keywords', async () => {
    const memories = [{ content: 'C++ 개발자' }];
    query.exec.mockResolvedValue(memories);

    await expect(service.searchMemories(userId, 'C++ 개발자', 3)).resolves.toBe(
      memories,
    );
    expect(model.find).toHaveBeenCalledWith({
      userId: new Types.ObjectId(userId),
      memoryType: 'long_term_memory',
      $or: [
        { content: { $regex: 'C\\+\\+', $options: 'i' } },
        { content: { $regex: '개발자', $options: 'i' } },
      ],
    });
    expect(query.sort).toHaveBeenCalledWith({ timestamp: -1 });
    expect(query.limit).toHaveBeenCalledWith(3);
  });

  it('does not query storage for blank search text', async () => {
    await expect(service.searchMemories(userId, '  \n ')).resolves.toEqual([]);
    expect(model.find).not.toHaveBeenCalled();
  });

  it('supports a one-character keyword without treating regex syntax as a pattern', async () => {
    await service.searchMemories(userId, '.');
    expect(model.find).toHaveBeenCalledWith(
      expect.objectContaining({
        $or: [{ content: { $regex: '\\.', $options: 'i' } }],
      }),
    );
    expect(query.limit).toHaveBeenCalledWith(5);
  });

  it('deduplicates and bounds memory search regex tokens', async () => {
    const manyTokens = [
      'Alpha',
      'alpha',
      'x'.repeat(100),
      ...Array.from({ length: 30 }, (_, index) => `token-${index}`),
    ].join(' ');

    await service.searchMemories(userId, manyTokens);

    const filter = model.find.mock.calls[0][0];
    expect(filter.$or).toHaveLength(16);
    expect(filter.$or[0]).toEqual({
      content: { $regex: 'Alpha', $options: 'i' },
    });
    expect(
      filter.$or.filter(
        (condition: any) => condition.content.$regex.toLowerCase() === 'alpha',
      ),
    ).toHaveLength(1);
    expect(
      filter.$or.every(
        (condition: any) => condition.content.$regex.length <= 64,
      ),
    ).toBe(true);
  });

  it('saves deduplicated long-term memories directly to MongoDB', async () => {
    await expect(
      service.saveLongTermMemories({
        userId,
        conversationId: 'call-1',
        memories: [{ content: '  커피 좋아함  ' }, { content: '커피 좋아함' }],
      }),
    ).resolves.toEqual({ savedCount: 1, updatedCount: 0, skippedCount: 1 });

    expect(model).toHaveBeenCalledTimes(1);
    expect(model).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: new Types.ObjectId(userId),
        memoryType: 'long_term_memory',
        content: '커피 좋아함',
        normalizedContent: '커피 좋아함',
      }),
    );
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('continues updating existing memories instead of creating duplicates', async () => {
    const existing = {
      content: '커피 좋아함',
      normalizedContent: '커피 좋아함',
      metadata: { tags: ['취향'] },
      save: jest.fn().mockResolvedValue({}),
    };
    query.exec.mockResolvedValue([existing]);
    await expect(
      service.saveLongTermMemories({
        userId,
        conversationId: 'call-2',
        memories: [{ content: '커피 좋아함', tags: ['음료'] }],
      }),
    ).resolves.toEqual({ savedCount: 0, updatedCount: 1, skippedCount: 0 });
    expect(existing.save).toHaveBeenCalledTimes(1);
    expect(existing.metadata.tags).toEqual(['취향', '음료']);
    expect(model).not.toHaveBeenCalled();
  });

  it('preserves call-record storage and token-usage metadata', async () => {
    await service.saveCallRecord({
      userId,
      conversationId: 'call-1',
      transcript: '  일어났어  ',
      metadata: { total_llm_tokens: 10 },
    });
    expect(model.findOneAndUpdate).toHaveBeenCalledWith(
      {
        userId: new Types.ObjectId(userId),
        conversationId: 'call-1',
        memoryType: 'call_record',
      },
      {
        $set: expect.objectContaining({
          content: '일어났어',
          summary: '일어났어',
          metadata: expect.objectContaining({ total_llm_tokens: 10 }),
        }),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  });

  it('deletes user memories and profile without loading vector IDs', async () => {
    await expect(service.deleteUserMemories(userId)).resolves.toEqual({
      deletedCount: 2,
      deletedUserInfo: true,
    });
    expect(model.find).not.toHaveBeenCalled();
    expect(model.deleteMany).toHaveBeenCalledWith({
      userId: new Types.ObjectId(userId),
    });
    expect(profile.deleteOne).toHaveBeenCalledWith({
      userId: new Types.ObjectId(userId),
    });
  });

  it('still deletes individual memories from MongoDB', async () => {
    query.exec.mockResolvedValue({ _id: 'memory-1' });
    await expect(service.deleteMemory('memory-1')).resolves.toEqual({
      success: true,
    });
    expect(model.deleteOne).toHaveBeenCalledWith({ _id: 'memory-1' });
  });

  it('stores optional task due dates on reminder metadata', async () => {
    await service.saveReminder({
      userId,
      content: '논문 마감',
      priority: 'high',
      dueAt: '2026-10-08T15:00:00.000Z',
    });

    expect(model).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: new Types.ObjectId(userId),
        memoryType: 'reminder',
        content: '논문 마감',
        metadata: expect.objectContaining({
          priority: 'high',
          dueAt: '2026-10-08T15:00:00.000Z',
          isCompleted: false,
        }),
      }),
    );
  });

  it('includes user ownership in assistant task updates', async () => {
    const reminderId = '507f191e810c19729de860ea';
    model.findOneAndUpdate.mockResolvedValue({ _id: reminderId });

    await service.updateReminderForUser(userId, reminderId, {
      completed: true,
    });

    expect(model.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: new Types.ObjectId(reminderId),
        userId: new Types.ObjectId(userId),
        $or: [{ memoryType: 'reminder' }, { 'metadata.type': 'reminder' }],
      },
      {
        $set: expect.objectContaining({
          'metadata.isCompleted': true,
          'metadata.completedAt': expect.any(String),
        }),
      },
      { new: true },
    );
  });

  it('includes user ownership in assistant task deletes', async () => {
    const reminderId = '507f191e810c19729de860ea';

    await expect(
      service.deleteReminderForUser(userId, reminderId),
    ).resolves.toEqual({ success: true });
    expect(model.deleteOne).toHaveBeenCalledWith({
      _id: new Types.ObjectId(reminderId),
      userId: new Types.ObjectId(userId),
      $or: [{ memoryType: 'reminder' }, { 'metadata.type': 'reminder' }],
    });
  });

  it('rejects malformed assistant task ids before querying MongoDB', async () => {
    await expect(
      service.deleteReminderForUser(userId, 'not-an-object-id'),
    ).resolves.toEqual({ success: false });
    expect(model.deleteOne).not.toHaveBeenCalled();
  });
});
