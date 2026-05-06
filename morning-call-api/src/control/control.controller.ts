import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from 'src/auth/auth.guard';
import { ControlCommandDto } from './dto/control-command.dto';
import { ControlService } from './control.service';

@ApiTags('Control')
@Controller('control')
export class ControlController {
  constructor(private readonly controlService: ControlService) {}

  @Post('chat')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '짧은 제어형 채팅 명령 처리',
    description:
      '알람 설정, 사용자 선호 업데이트, 일정/알람 조회처럼 짧은 명령만 처리합니다.',
  })
  async handleChat(@Req() req, @Body() dto: ControlCommandDto) {
    return this.controlService.handleCommand(req.user, dto.message);
  }
}
