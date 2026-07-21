"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var LivekitService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.LivekitService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const livekit_server_sdk_1 = require("livekit-server-sdk");
let LivekitService = LivekitService_1 = class LivekitService {
    constructor(configService) {
        this.configService = configService;
        this.apiKey = this.configService.get('livekit.apiKey');
        this.secret = this.configService.get('livekit.secretKey');
        this.url = this.configService.get('livekit.websocketUrl');
        this.roomService = new livekit_server_sdk_1.RoomServiceClient(this.url, this.apiKey, this.secret);
        this.agentDispatch = new livekit_server_sdk_1.AgentDispatchClient(this.url, this.apiKey, this.secret);
    }
    async prewarmAgent(roomName, prompt, voice, userId, timeZone, alarmId, callType = 'initial', retryCount = 0) {
        await this.ensureRoom(roomName);
        const participant = await this.listParticipantsIfRoomExists(roomName);
        if (participant.length > 0) {
            console.log('[Livekit] Haru already exists in room', roomName);
            return;
        }
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
    }
    async ensureAgentReadyForTest(roomName, prompt, voice, userId, timeZone, alarmId, callType = 'initial', retryCount = 0) {
        await this.prewarmAgent(roomName, prompt, voice, userId, timeZone, alarmId, callType, retryCount);
        await this.waitForAgentParticipant(roomName);
    }
    async waitForAgentParticipant(roomName, timeoutMs = LivekitService_1.AGENT_WAIT_TIMEOUT_MS) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            const participants = await this.listParticipantsIfRoomExists(roomName);
            if (participants.length > 0) {
                return;
            }
            await new Promise((resolve) => setTimeout(resolve, LivekitService_1.AGENT_WAIT_INTERVAL_MS));
        }
        throw new Error(`[Livekit] Timed out waiting for agent to join room ${roomName}`);
    }
    async ensureRoom(roomName) {
        try {
            await this.roomService.createRoom({
                name: roomName,
                emptyTimeout: 60 * 5,
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (!message.toLowerCase().includes('already exists')) {
                throw error;
            }
            console.log('[Livekit] room already exists', roomName);
        }
    }
    async getRoom(roomName) {
        try {
            const room = await this.roomService.listParticipants(roomName);
            return room;
        }
        catch (error) {
            console.log('[Livekit] getParticipant error', error);
        }
    }
    async generateLivkitToken(roomName, participantName) {
        const at = new livekit_server_sdk_1.AccessToken(this.apiKey, this.secret, {
            identity: participantName,
        });
        at.addGrant({ roomJoin: true, room: roomName });
        const token = await at.toJwt();
        return token;
    }
    async listParticipantsIfRoomExists(roomName) {
        try {
            return await this.roomService.listParticipants(roomName);
        }
        catch (error) {
            if (this.isLivekitNotFoundError(error)) {
                console.warn(`[Livekit] room not visible yet; retrying participant lookup ${roomName}`);
                return [];
            }
            throw error;
        }
    }
    isLivekitNotFoundError(error) {
        const maybeError = error;
        return maybeError.status === 404 || maybeError.code === 'not_found';
    }
};
LivekitService.AGENT_WAIT_TIMEOUT_MS = 30000;
LivekitService.AGENT_WAIT_INTERVAL_MS = 300;
LivekitService = LivekitService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], LivekitService);
exports.LivekitService = LivekitService;
//# sourceMappingURL=livekit.service.js.map