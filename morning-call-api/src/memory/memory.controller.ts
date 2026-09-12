import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { SaveCallRecordDto } from './dto/save-call-record.dto';
import { SaveReminderDto } from './dto/save-reminder.dto';
import { SaveUserInfoDto } from './dto/save-user-info.dto';
import { UpsertLongTermMemoriesDto } from './dto/upsert-long-term-memories.dto';
import { MemoryService } from './memory.service';

@Controller('memory')
export class MemoryController {
  private readonly logger = new Logger(MemoryController.name);

  constructor(private readonly memoryService: MemoryService) {}

  /**
   * POST /memory/call-record
   * 통화 종료 후 전체 transcript를 1회 저장
   */
  @Post('call-record')
  @HttpCode(HttpStatus.CREATED)
  async saveCallRecord(@Body() dto: SaveCallRecordDto) {
    this.logger.log(
      `Saving call record for user ${dto.userId}, conversation ${dto.conversationId}`,
    );

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

  /**
   * POST /memory/long-term
   * 통화 transcript에서 추출한 장기 메모리 저장
   */
  @Post('long-term')
  @HttpCode(HttpStatus.OK)
  async saveLongTermMemories(@Body() dto: UpsertLongTermMemoriesDto) {
    this.logger.log(
      `Saving ${dto.memories?.length || 0} long-term memories for user ${
        dto.userId
      }`,
    );

    const result = await this.memoryService.saveLongTermMemories(dto);

    return {
      success: true,
      message: 'Long-term memories processed successfully',
      data: result,
    };
  }

  /**
   * GET /memory/recent?userId=xxx&limit=10
   * 최근 통화 기록 조회
   */
  @Get('recent')
  async getRecentCallRecords(
    @Query('userId') userId: string,
    @Query('limit') limit?: string,
  ) {
    this.logger.log(`Fetching recent call records for user ${userId}`);

    if (!userId) {
      return {
        success: false,
        message: 'userId is required',
        data: [],
      };
    }

    const limitNum = limit ? parseInt(limit, 10) : 10;
    const memories = await this.memoryService.getRecentCallRecords(
      userId,
      limitNum,
    );

    return {
      success: true,
      message: `Retrieved ${memories.length} recent call records`,
      data: memories,
    };
  }

  /**
   * GET /memory/conversation/:conversationId
   * 특정 통화 세션의 저장된 기록 조회
   */
  @Get('conversation/:conversationId')
  async getConversationMemories(
    @Param('conversationId') conversationId: string,
  ) {
    this.logger.log(`Fetching call record for conversation ${conversationId}`);

    const memories = await this.memoryService.getConversationMemories(
      conversationId,
    );

    return {
      success: true,
      message: `Retrieved ${memories.length} conversation records`,
      data: memories,
    };
  }

  /**
   * GET /memory/search?userId=xxx&q=검색어&limit=5
   * 장기 메모리 키워드 검색 (MongoDB)
   */
  @Get('search')
  async searchMemories(
    @Query('userId') userId: string,
    @Query('q') query?: string,
    @Query('query') legacyQuery?: string,
    @Query('limit') limit?: string,
  ) {
    const resolvedQuery = query || legacyQuery || '';
    this.logger.log(
      `Searching memories for user ${userId}, query: "${resolvedQuery}"`,
    );

    if (!userId || !resolvedQuery) {
      return {
        success: false,
        message: 'userId and q are required',
        data: [],
      };
    }

    const limitNum = limit ? parseInt(limit, 10) : 5;
    const memories = await this.memoryService.searchMemories(
      userId,
      resolvedQuery,
      limitNum,
    );

    return {
      success: true,
      message: `Found ${memories.length} relevant memories`,
      data: memories,
    };
  }

  /**
   * DELETE /memory/user/:userId
   * 사용자의 통화 기록/장기 메모리/프로필 삭제
   */
  @Delete('user/:userId')
  async deleteUserMemories(@Param('userId') userId: string) {
    this.logger.log(`Deleting all memories for user ${userId}`);

    const result = await this.memoryService.deleteUserMemories(userId);

    return {
      success: true,
      message: `Deleted ${result.deletedCount} memories`,
      data: result,
    };
  }

  /**
   * POST /memory/user-info
   * 사용자 정적 정보 저장
   */
  @Post('user-info')
  @HttpCode(HttpStatus.OK)
  async saveUserInfo(@Body() dto: SaveUserInfoDto) {
    this.logger.log(
      `Saving user info: ${dto.key} = ${dto.value} for user ${dto.userId}`,
    );

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

  /**
   * GET /memory/user-info/:userId
   * 사용자 정적 정보 조회
   */
  @Get('user-info/:userId')
  async getUserInfo(@Param('userId') userId: string) {
    this.logger.log(`Fetching user info for user ${userId}`);

    const userInfo = await this.memoryService.getUserInfo(userId);

    return {
      success: true,
      message: 'User info retrieved successfully',
      data: userInfo,
    };
  }

  /**
   * DELETE /memory/user-info/:userId/:key
   * 저장된 사용자 정보의 특정 키 삭제
   */
  @Delete('user-info/:userId/:key')
  async deleteUserInfo(
    @Param('userId') userId: string,
    @Param('key') key: string,
  ) {
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

  /**
   * GET /memory/context?userId=xxx
   * 통화 시작 전 최소 부트스트랩 컨텍스트 조회
   */
  @Get('context')
  async getContext(@Query('userId') userId: string) {
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

  /**
   * GET /memory/all?userId=xxx&limit=100
   * 사용자의 모든 메모리 조회
   */
  @Get('all')
  async getAllMemories(
    @Query('userId') userId: string,
    @Query('limit') limit?: string,
  ) {
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

  /**
   * DELETE /memory/:memoryId
   * 특정 메모리 삭제
   */
  @Delete(':memoryId')
  async deleteMemory(@Param('memoryId') memoryId: string) {
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

  /**
   * POST /memory/reminder
   * 리마인더 저장
   */
  @Post('reminder')
  @HttpCode(HttpStatus.CREATED)
  async saveReminder(@Body() dto: SaveReminderDto) {
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

  /**
   * GET /memory/reminders?userId=xxx
   * 리마인더 목록 조회
   */
  @Get('reminders')
  async getReminders(@Query('userId') userId: string) {
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

  /**
   * PATCH /memory/reminder/:id/complete
   * 리마인더 완료 처리
   */
  @Patch('reminder/:id/complete')
  async completeReminder(@Param('id') reminderId: string) {
    this.logger.log(`Completing reminder ${reminderId}`);

    const result = await this.memoryService.completeReminder(reminderId);

    return {
      success: result.success,
      message: result.success ? 'Reminder completed' : 'Reminder not found',
      data: result,
    };
  }

  /**
   * DELETE /memory/reminder/:id
   * 리마인더 삭제
   */
  @Delete('reminder/:id')
  async deleteReminder(@Param('id') reminderId: string) {
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
}
