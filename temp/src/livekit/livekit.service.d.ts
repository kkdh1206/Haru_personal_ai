import { ConfigService } from '@nestjs/config';
export declare class LivekitService {
    private readonly configService;
    private static readonly AGENT_WAIT_TIMEOUT_MS;
    private static readonly AGENT_WAIT_INTERVAL_MS;
    private readonly apiKey;
    private readonly secret;
    private readonly url;
    private readonly roomService;
    private readonly agentDispatch;
    constructor(configService: ConfigService);
    prewarmAgent(roomName: string, prompt: string, voice: string, userId: string, timeZone: string, alarmId?: string, callType?: 'initial' | 'retry', retryCount?: number): Promise<void>;
    ensureAgentReadyForTest(roomName: string, prompt: string, voice: string, userId: string, timeZone: string, alarmId?: string, callType?: 'initial' | 'retry', retryCount?: number): Promise<void>;
    waitForAgentParticipant(roomName: string, timeoutMs?: number): Promise<void>;
    ensureRoom(roomName: string): Promise<void>;
    getRoom(roomName: string): Promise<any>;
    generateLivkitToken(roomName: string, participantName: string): Promise<string>;
    private listParticipantsIfRoomExists;
    private isLivekitNotFoundError;
}
