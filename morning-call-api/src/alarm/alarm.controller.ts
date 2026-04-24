import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AlarmService } from './alarm.service';
import { AlarmDto } from './dto/alarm.dto';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AuthGuard } from 'src/auth/auth.guard';
import { TestCallDto } from './dto/test-call.dto';
import { RetryAlarmDto } from './dto/retry-alarm.dto';
import { ReportCallOutcomeDto } from './dto/report-call-outcome.dto';

@Controller('alarm')
export class AlarmController {
  constructor(private readonly alarmService: AlarmService) {}

  @Post()
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '알람 생성',
    description: '알람을 생성합니다.',
  })
  async create(@Req() req, @Body() dto: AlarmDto) {
    return this.alarmService.createAlarm(req.user._id, dto);
  }

  @Get()
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '알람 조회',
    description: '알람을 조회합니다.',
  })
  async findAll(@Req() req) {
    return this.alarmService.findAllAlarms(req.user._id);
  }

  @Put(':id')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '알람 수정',
    description: '알람을 수정합니다.',
  })
  async update(@Req() req, @Param('id') id: string, @Body() dto: AlarmDto) {
    return this.alarmService.updateAlarm(req.user._id.toString(), id, dto);
  }

  @Delete(':id')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '알람 삭제',
    description: '알람을 삭제합니다.',
  })
  async delete(@Req() req, @Param('id') id: string) {
    return this.alarmService.deleteAlarm(req.user._id.toString(), id);
  }

  @Post('test-call')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '테스트 전화',
    description: '테스트 전화를 위한 토큰을 발급합니다.',
  })
  async testCall(@Req() req, @Body() dto: TestCallDto) {
    return this.alarmService.testCall(req.user, dto);
  }

  @Post('retry')
  @ApiOperation({
    summary: '알람 재통화 예약',
    description: '현재 알람 통화가 끝난 뒤 몇 분 후 다시 전화하도록 예약합니다.',
  })
  async retry(@Body() dto: RetryAlarmDto) {
    return this.alarmService.scheduleRetryCall(
      dto.alarmId,
      dto.retryMinutes ?? 3,
    );
  }

  @Post('call-outcome')
  @ApiOperation({
    summary: '알람 통화 결과 보고',
    description: '에이전트가 통화 종료 후 wake 상태를 보고하고 후속 재통화 여부를 결정합니다.',
  })
  async reportCallOutcome(@Body() dto: ReportCallOutcomeDto) {
    return this.alarmService.handleCallOutcome(dto);
  }
}
