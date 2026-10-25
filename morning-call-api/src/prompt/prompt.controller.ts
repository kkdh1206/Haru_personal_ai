import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation } from '@nestjs/swagger';
import { AgentSecretGuard } from 'src/auth/agent-secret.guard';
import { PromptService } from './prompt.service';

@UseGuards(AgentSecretGuard)
@Controller('prompt')
export class PromptController {
  constructor(private readonly promptService: PromptService) {}

  @Post()
  @ApiOperation({
    summary: '프롬프트 가져오기',
    description: '알람 uid에 알맞은 프롬프트를 가져옵니다.',
  })
  @ApiBody({
    type: String,
    required: true,
    description: '알람 uid',
  })
  async getPrompt(@Body() dto: { alarmId: string }) {
    return this.promptService.getPrompt(dto.alarmId);
  }
}
