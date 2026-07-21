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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LivekitController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const auth_guard_1 = require("../auth/auth.guard");
const common_2 = require("@nestjs/common");
const swagger_2 = require("@nestjs/swagger");
const swagger_3 = require("@nestjs/swagger");
const livekit_service_1 = require("./livekit.service");
const config_1 = require("@nestjs/config");
let LivekitController = class LivekitController {
    constructor(livekitService, cs) {
        this.livekitService = livekitService;
        this.cs = cs;
        this.livekitUrl = this.cs.getOrThrow('livekit.websocketUrl');
    }
    async getToken(req) {
        const lkToken = await this.livekitService.generateLivkitToken(req.user._id.toString(), req.user._id.toString());
        return { lkToken, lkUrl: this.livekitUrl };
    }
    async getRoomInfos(roomName) {
        return this.livekitService.getRoom(roomName);
    }
};
__decorate([
    (0, common_1.Get)('room'),
    (0, common_2.UseGuards)(auth_guard_1.AuthGuard),
    (0, swagger_2.ApiBearerAuth)(),
    (0, swagger_3.ApiOperation)({
        summary: 'LiveKit URL과 토큰을 가져옵니다.',
        description: '해당 유저의 LiveKit 방을 생성하고 URL과 토큰을 가져옵니다.',
    }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], LivekitController.prototype, "getToken", null);
__decorate([
    (0, common_1.Get)('room/:roomName'),
    (0, swagger_3.ApiOperation)({
        summary: 'LiveKit 방 정보를 가져옵니다.',
        description: '해당 방의 참여자들 정보를 가져옵니다.',
    }),
    __param(0, (0, common_1.Param)('roomName')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], LivekitController.prototype, "getRoomInfos", null);
LivekitController = __decorate([
    (0, swagger_1.ApiTags)('Livekit'),
    (0, common_1.Controller)('livekit'),
    __metadata("design:paramtypes", [livekit_service_1.LivekitService,
        config_1.ConfigService])
], LivekitController);
exports.LivekitController = LivekitController;
//# sourceMappingURL=livekit.controller.js.map