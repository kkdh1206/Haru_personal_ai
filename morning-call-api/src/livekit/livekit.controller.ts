import { Controller, Get, Param, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthGuard } from 'src/auth/auth.guard';
import { UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { ApiOperation } from '@nestjs/swagger';
import { LivekitService } from './livekit.service';
import { ConfigService } from '@nestjs/config';

@ApiTags('Livekit')
@Controller('livekit')
export class LivekitController {
  private readonly livekitUrl: string;

  constructor(
    private readonly livekitService: LivekitService,
    private readonly cs: ConfigService,
  ) {
    this.livekitUrl = this.cs.getOrThrow<string>('livekit.websocketUrl');
  }

  /** Deprecated */
  @Get('room')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'LiveKit URL과 토큰을 가져옵니다.',
    description: '해당 유저의 LiveKit 방을 생성하고 URL과 토큰을 가져옵니다.',
  })
  async getToken(@Req() req) {
    const lkToken = await this.livekitService.generateLivkitToken(
      req.user._id.toString(),
      req.user._id.toString(),
    );
    return { lkToken, lkUrl: this.livekitUrl };
  }

  // TODO: 배포 전에 지울 것 (테스트 용)
  @Get('room/:roomName')
  @ApiOperation({
    summary: 'LiveKit 방 정보를 가져옵니다.',
    description: '해당 방의 참여자들 정보를 가져옵니다.',
  })
  async getRoomInfos(@Param('roomName') roomName: string) {
    return this.livekitService.getRoom(roomName);
  }
}
