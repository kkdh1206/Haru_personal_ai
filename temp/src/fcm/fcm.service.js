"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FcmService = void 0;
const common_1 = require("@nestjs/common");
const firebase = __importStar(require("firebase-admin"));
let FcmService = class FcmService {
    async sendCallPush(token, payload) {
        return this.sendDataMessage(token, {
            caller: payload.caller,
            lkUrl: payload.lkUrl,
            lkToken: payload.lkToken,
            alarmId: payload.alarmId,
        });
    }
    async sendWakeFollowupPush(token, body) {
        return this.sendDataMessage(token, {
            type: 'wake_followup',
            title: 'Haru',
            body,
        });
    }
    async sendDataMessage(token, data) {
        try {
            const messageId = await firebase.messaging().send({
                token,
                data,
                android: {
                    priority: 'high',
                    ttl: 120000,
                },
            });
            return { sent: [messageId], failed: [] };
        }
        catch (error) {
            console.error('❌ FCM push failed', error);
            return { sent: [], failed: [{ token, error }] };
        }
    }
};
FcmService = __decorate([
    (0, common_1.Injectable)()
], FcmService);
exports.FcmService = FcmService;
//# sourceMappingURL=fcm.service.js.map