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

    await expect(service.searchMemories(userId, 'C++ 개발자', 3)).resolves.toBe(memories);
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
    expect(model.find).toHaveBeenCalledWith(expect.objectContaining({
      $or: [{ content: { $regex: '\\.', $options: 'i' } }],
    }));
    expect(query.limit).toHaveBeenCalledWith(5);
  });

  it('saves deduplicated long-term memories directly to MongoDB', async () => {
    await expect(service.saveLongTermMemories({
      userId,
      conversationId: 'call-1',
      memories: [{ content: '  커피 좋아함  ' }, { content: '커피 좋아함' }],
    })).resolves.toEqual({ savedCount: 1, updatedCount: 0, skippedCount: 1 });

    expect(model).toHaveBeenCalledTimes(1);
    expect(model).toHaveBeenCalledWith(expect.objectContaining({
      userId: new Types.ObjectId(userId),
      memoryType: 'long_term_memory',
      content: '커피 좋아함',
      normalizedContent: '커피 좋아함',
    }));
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('continues updating existing memories instead of creating duplicates', async () => {
    const existing = {
      content: '커피 좋아함', normalizedContent: '커피 좋아함',
      metadata: { tags: ['취향'] }, save: jest.fn().mockResolvedValue({}),
    };
    query.exec.mockResolvedValue([existing]);
    await expect(service.saveLongTermMemories({
      userId, conversationId: 'call-2',
      memories: [{ content: '커피 좋아함', tags: ['음료'] }],
    })).resolves.toEqual({ savedCount: 0, updatedCount: 1, skippedCount: 0 });
    expect(existing.save).toHaveBeenCalledTimes(1);
    expect(existing.metadata.tags).toEqual(['취향', '음료']);
    expect(model).not.toHaveBeenCalled();
  });

  it('preserves call-record storage and token-usage metadata', async () => {
    await service.saveCallRecord({
      userId, conversationId: 'call-1', transcript: '  일어났어  ',
      metadata: { total_llm_tokens: 10 },
    });
    expect(model.findOneAndUpdate).toHaveBeenCalledWith(
      { userId: new Types.ObjectId(userId), conversationId: 'call-1', memoryType: 'call_record' },
      { $set: expect.objectContaining({
        content: '일어났어', summary: '일어났어',
        metadata: expect.objectContaining({ total_llm_tokens: 10 }),
      }) },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  });

  it('deletes user memories and profile without loading vector IDs', async () => {
    await expect(service.deleteUserMemories(userId)).resolves.toEqual({
      deletedCount: 2, deletedUserInfo: true,
    });
    expect(model.find).not.toHaveBeenCalled();
    expect(model.deleteMany).toHaveBeenCalledWith({ userId: new Types.ObjectId(userId) });
    expect(profile.deleteOne).toHaveBeenCalledWith({ userId: new Types.ObjectId(userId) });
  });

  it('still deletes individual memories from MongoDB', async () => {
    query.exec.mockResolvedValue({ _id: 'memory-1' });
    await expect(service.deleteMemory('memory-1')).resolves.toEqual({ success: true });
    expect(model.deleteOne).toHaveBeenCalledWith({ _id: 'memory-1' });
  });
});
