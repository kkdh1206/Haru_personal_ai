import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CalendarService } from './calendar.service';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AuthGuard } from 'src/auth/auth.guard';
import { AgentSecretGuard } from 'src/auth/agent-secret.guard';
import { CreateCalendarEventDto } from './dto/create-calendar-event.dto';
import { MorningCallAppleCalendarDto } from './dto/sync-apple-calendar.dto';

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
  @UseGuards(AgentSecretGuard)
  @ApiOperation({
    summary: '캘린더 일정 생성',
    description:
      '사용자가 선택한 Google 또는 Apple 캘린더에 일정을 추가합니다.',
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

  @Put('apple/morning-call-events')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '모닝콜 직전 Apple Calendar 일정 일회성 전달' })
  async receiveMorningCallAppleCalendar(
    @Req() req,
    @Body() dto: MorningCallAppleCalendarDto,
  ) {
    return this.calendarService.receiveMorningCallAppleCalendar(
      req.user._id,
      dto,
    );
  }
}
