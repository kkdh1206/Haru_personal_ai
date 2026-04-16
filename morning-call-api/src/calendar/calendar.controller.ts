import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { CalendarService } from './calendar.service';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AuthGuard } from 'src/auth/auth.guard';
import { CreateCalendarEventDto } from './dto/create-calendar-event.dto';

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
    description: '사용자의 구글 캘린더에 새 일정을 추가합니다.',
  })
  async createEvent(@Body() dto: CreateCalendarEventDto) {
    return this.calendarService.createEvent(dto.userId, dto);
  }
}
