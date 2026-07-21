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
exports.ControlController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const auth_guard_1 = require("../auth/auth.guard");
const control_command_dto_1 = require("./dto/control-command.dto");
const control_service_1 = require("./control.service");
let ControlController = class ControlController {
    constructor(controlService) {
        this.controlService = controlService;
    }
    async handleChat(req, dto) {
        return this.controlService.handleCommand(req.user, dto.message);
    }
};
__decorate([
    (0, common_1.Post)('chat'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({
        summary: '짧은 제어형 채팅 명령 처리',
        description: '알람 설정, 사용자 선호 업데이트, 일정/알람 조회처럼 짧은 명령만 처리합니다.',
    }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, control_command_dto_1.ControlCommandDto]),
    __metadata("design:returntype", Promise)
], ControlController.prototype, "handleChat", null);
ControlController = __decorate([
    (0, swagger_1.ApiTags)('Control'),
    (0, common_1.Controller)('control'),
    __metadata("design:paramtypes", [control_service_1.ControlService])
], ControlController);
exports.ControlController = ControlController;
//# sourceMappingURL=control.controller.js.map