import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AccessToken,
  AgentDispatchClient,
  RoomServiceClient,
} from 'livekit-server-sdk';

@Injectable()
export class LivekitService {
  private static readonly AGENT_WAIT_TIMEOUT_MS = 15000;
  private static readonly AGENT_WAIT_INTERVAL_MS = 300;

  private readonly apiKey = this.configService.get<string>('livekit.apiKey');
  private readonly secret = this.configService.get<string>('livekit.secretKey');
  private readonly url = this.configService.get<string>('livekit.websocketUrl');

  private readonly roomService = new RoomServiceClient(
    this.url,
    this.apiKey,
    this.secret,
  );

  private readonly agentDispatch = new AgentDispatchClient(
    this.url,
    this.apiKey,
    this.secret,
  );

  constructor(private readonly configService: ConfigService) {}

  async readyAgent(
    roomName: string,
    prompt: string,
    voice: string,
    userId: string,
    timeZone: string,
    alarmId?: string,
    callType: 'initial' | 'retry' = 'initial',
    retryCount = 0,
  ) {
    // 1. 방 먼저 생성 후
    try {
      await this.roomService.createRoom({
        name: roomName,
        emptyTimeout: 60 * 5, // 유저가 안 들어와도 5분 후 정리
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.toLowerCase().includes('already exists')) {
        throw error;
      }
      console.log('[Livekit] room already exists', roomName);
    }

    // 2. 에이전트가 이미 방에 들어가 있는지 확인
    const participant = await this.roomService.listParticipants(roomName);
    if (participant.length > 0) {
      console.log('[Livekit] Haru already exists in room', roomName);
      return;
    }

    // 3. 없다면 새로운 에이전트 디스패치
    await this.agentDispatch.createDispatch(roomName, 'Haru', {
      metadata: JSON.stringify({
        prompt,
        voice,
        user_id: userId,
        time_zone: timeZone,
        alarm_id: alarmId || null,
        call_type: callType,
        retry_count: retryCount,
      }),
    });

    await this.waitForAgentParticipant(roomName);
  }

  // TODO: 배포 전에 지울 것 (테스트 용)
  async getRoom(roomName: string): Promise<any> {
    try {
      const room = await this.roomService.listParticipants(roomName);
      return room;
    } catch (error) {
      console.log('[Livekit] getParticipant error', error);
    }
  }

  async generateLivkitToken(roomName: string, participantName: string) {
    const at = new AccessToken(this.apiKey, this.secret, {
      identity: participantName,
    });
    at.addGrant({ roomJoin: true, room: roomName });

    const token = await at.toJwt();
    return token;
  }

  private async waitForAgentParticipant(roomName: string) {
    const deadline = Date.now() + LivekitService.AGENT_WAIT_TIMEOUT_MS;

    while (Date.now() < deadline) {
      const participants = await this.roomService.listParticipants(roomName);
      if (participants.length > 0) {
        return;
      }

      await new Promise((resolve) =>
        setTimeout(resolve, LivekitService.AGENT_WAIT_INTERVAL_MS),
      );
    }

    throw new Error(
      `[Livekit] Timed out waiting for agent to join room ${roomName}`,
    );
  }
}
