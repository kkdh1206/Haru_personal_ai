import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CalendarService } from './calendar.service';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AuthGuard } from 'src/auth/auth.guard';
import { CreateCalendarEventDto } from './dto/create-calendar-event.dto';
import { SyncAppleCalendarDto } from './dto/sync-apple-calendar.dto';
import { CompleteAppleCalendarEventDto } from './dto/complete-apple-calendar-event.dto';

@Controller('calendar')
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  @Get('today')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '오늘 일정 조회',
    description: '오늘 일정을 조회합니다.',
  })
  async getTodayEvents(@Req() req) {
    return this.calendarService.getTodayEvents(req.user._id);
  }

  @Post('event')
  @ApiOperation({
    summary: '캘린더 일정 생성',
    description: '사용자가 선택한 Google 또는 Apple 캘린더에 일정을 추가합니다.',
  })
  async createEvent(@Body() dto: CreateCalendarEventDto) {
    return this.calendarService.createEvent(dto.userId, dto);
  }

  @Put('apple/connect')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Apple Calendar 연결' })
  async connectAppleCalendar(@Req() req) {
    return this.calendarService.connectAppleCalendar(req.user._id);
  }

  @Delete('apple')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Apple Calendar 연결 해제' })
  async disconnectAppleCalendar(@Req() req) {
    return this.calendarService.disconnectAppleCalendar(req.user._id);
  }

  @Put('apple/events')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Apple Calendar 일정 스냅샷 동기화' })
  async syncAppleCalendar(@Req() req, @Body() dto: SyncAppleCalendarDto) {
    return this.calendarService.syncAppleCalendar(req.user._id, dto);
  }

  @Get('apple/pending')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'iPhone에 추가할 Apple Calendar 일정 조회' })
  async getPendingAppleCalendarEvents(@Req() req) {
    return this.calendarService.getPendingAppleCalendarEvents(req.user._id);
  }

  @Patch('apple/pending/:eventId')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Apple Calendar 일정 추가 결과 처리' })
  async completePendingAppleCalendarEvent(
    @Req() req,
    @Param('eventId') eventId: string,
    @Body() dto: CompleteAppleCalendarEventDto,
  ) {
    return this.calendarService.completePendingAppleCalendarEvent(
      req.user._id,
      eventId,
      dto,
    );
  }
}
