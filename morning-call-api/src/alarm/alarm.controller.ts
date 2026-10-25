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
import { AlarmService } from './alarm.service';
import { AlarmDto } from './dto/alarm.dto';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AuthGuard } from 'src/auth/auth.guard';
import { AgentSecretGuard } from 'src/auth/agent-secret.guard';
import { TestCallDto } from './dto/test-call.dto';
import { RetryAlarmDto } from './dto/retry-alarm.dto';
import { ReportCallOutcomeDto } from './dto/report-call-outcome.dto';
import { CancelOnboardingTestCallDto } from './dto/cancel-onboarding-test-call.dto';
import { SyncTimeZoneDto } from './dto/sync-time-zone.dto';

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

  @Get('call-usage')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '오늘의 모닝콜 사용량 조회',
    description:
      '사용자 현지 날짜를 기준으로 일반 모닝콜과 재통화의 사용량 및 남은 횟수를 조회합니다.',
  })
  async getDailyCallUsage(@Req() req) {
    return this.alarmService.getDailyCallUsage(req.user._id.toString());
  }

  @Patch('time-zone')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '사용자 및 알람 시간대 동기화',
    description:
      '현재 기기 시간대를 사용자와 모든 알람에 반영하고 활성 알람을 다시 예약합니다.',
  })
  async syncTimeZone(@Req() req, @Body() dto: SyncTimeZoneDto) {
    return this.alarmService.syncUserTimeZone(
      req.user._id.toString(),
      dto.timeZone,
    );
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

  @Delete('onboarding-test-call')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '온보딩 테스트 전화 취소',
    description:
      '예약된 테스트 전화 작업과 미리 준비한 LiveKit 방을 정리합니다.',
  })
  async cancelOnboardingTestCall(
    @Req() req,
    @Body() dto: CancelOnboardingTestCallDto,
  ) {
    return this.alarmService.cancelOnboardingTestCall(
      req.user._id.toString(),
      dto,
    );
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

  @Post('onboarding-test-call')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '온보딩 수신 테스트 전화 예약',
    description:
      '테스트 전용 상태로 에이전트를 준비하고 지정된 시간 뒤 VoIP 수신 전화를 한 번 보냅니다. 재통화는 예약하지 않습니다.',
  })
  async onboardingTestCall(@Req() req, @Body() dto: TestCallDto) {
    return this.alarmService.scheduleOnboardingTestCall(req.user, dto);
  }

  @Post('retry')
  @UseGuards(AgentSecretGuard)
  @ApiOperation({
    summary: '알람 재통화 예약',
    description:
      '현재 알람 통화가 끝난 뒤 몇 분 후 다시 전화하도록 예약합니다.',
  })
  async retry(@Body() dto: RetryAlarmDto) {
    return this.alarmService.scheduleRetryCall(dto.alarmId, dto.retryMinutes);
  }

  @Post('call-outcome')
  @UseGuards(AgentSecretGuard)
  @ApiOperation({
    summary: '알람 통화 결과 보고',
    description:
      '에이전트가 통화 종료 후 wake 상태를 보고하고 후속 재통화 여부를 결정합니다.',
  })
  async reportCallOutcome(@Body() dto: ReportCallOutcomeDto) {
    return this.alarmService.handleCallOutcome(dto);
  }
}
