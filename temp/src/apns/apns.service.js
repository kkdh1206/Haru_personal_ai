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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApnsService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const apn_1 = __importDefault(require("apn"));
const fs_1 = __importDefault(require("fs"));
function summarizeApnsResult(res) {
    return {
        sent: res.sent,
        failed: res.failed.map((failure) => {
            var _a, _b, _c;
            return ({
                device: failure.device,
                status: failure.status,
                reason: (_a = failure.response) === null || _a === void 0 ? void 0 : _a.reason,
                timestamp: (_b = failure.response) === null || _b === void 0 ? void 0 : _b.timestamp,
                error: (_c = failure.error) === null || _c === void 0 ? void 0 : _c.message,
            });
        }),
    };
}
let ApnsService = class ApnsService {
    constructor(cs) {
        this.cs = cs;
        this.livekitUrl = this.cs.getOrThrow('livekit.websocketUrl');
        this.provider = new apn_1.default.Provider({
            token: {
                key: fs_1.default.readFileSync('APNsKey.p8'),
                keyId: this.cs.getOrThrow('apns.keyId'),
                teamId: this.cs.getOrThrow('apns.teamId'),
            },
            production: this.cs.get('apns.production'),
        });
    }
    applyPushHeaders(note, pushType, expiration) {
        const notification = note;
        const originalHeaders = notification.headers.bind(notification);
        notification.headers = () => {
            const headers = Object.assign(Object.assign({}, originalHeaders()), { 'apns-push-type': pushType });
            if (expiration !== undefined) {
                headers['apns-expiration'] = expiration;
            }
            return headers;
        };
    }
    async sendVoipPush(token, payload) {
        const note = new apn_1.default.Notification();
        note.topic = `${this.cs.get('apns.bundleId')}.voip`;
        note.priority = 10;
        note.aps = { 'content-available': 1 };
        note.payload = {
            caller: payload.caller,
            lkUrl: this.livekitUrl,
            lkToken: payload.livekitToken,
            alarmId: payload.alarmId,
        };
        this.applyPushHeaders(note, 'voip', 0);
        const res = await this.provider.send(note, token);
        console.log(res.sent.length ? '✅ sent' : '❌ failed', summarizeApnsResult(res));
        return res;
    }
    async sendWakeFollowupPush(token, body) {
        const note = new apn_1.default.Notification();
        note.topic = this.cs.getOrThrow('apns.bundleId');
        note.priority = 10;
        note.expiry = Math.floor(Date.now() / 1000) + 120;
        note.alert = {
            title: 'Haru',
            body,
        };
        note.sound = 'default';
        note.payload = { type: 'wake_followup' };
        this.applyPushHeaders(note, 'alert');
        const res = await this.provider.send(note, token);
        console.log(res.sent.length ? '✅ followup sent' : '❌ followup failed', summarizeApnsResult(res));
        return res;
    }
    onModuleDestroy() {
        this.provider.shutdown();
    }
};
ApnsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], ApnsService);
exports.ApnsService = ApnsService;
//# sourceMappingURL=apns.service.js.map