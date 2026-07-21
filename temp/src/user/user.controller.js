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
exports.UserController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const auth_guard_1 = require("../auth/auth.guard");
const user_service_1 = require("./user.service");
const update_user_dto_1 = require("./dto/update-user.dto");
const device_token_dto_1 = require("./dto/device-token.dto");
const calendar_token_dto_1 = require("./dto/calendar-token.dto");
const custom_message_dto_1 = require("./dto/custom-message.dto");
const location_dto_1 = require("./dto/location.dto");
const calendar_code_dto_1 = require("./dto/calendar-code.dto");
let UserController = class UserController {
    constructor(userService) {
        this.userService = userService;
    }
    checkAndRegister(req) {
        return req.user;
    }
    async updateDeviceToken(req, dto) {
        var _a;
        const updated = await this.userService.updateDeviceToken(req.user._id, dto.deviceToken, (_a = dto.deviceType) !== null && _a !== void 0 ? _a : 'ios', dto.notificationToken);
        if (!updated)
            return 'failed';
        return 'updated';
    }
    async updateCalendarToken(req, dto) {
        const updated = await this.userService.updateCalendarToken(req.user._id, dto.calendarAccessToken, dto.calendarRefreshToken);
        if (!updated)
            return 'failed';
        return 'updated';
    }
    async updateCalendarTokenFromCode(req, dto) {
        return this.userService.updateCalendarTokenFromAuthCode(req.user._id, dto.serverAuthCode);
    }
    async getCalendarStatus(req) {
        return this.userService.getCalendarStatus(req.user._id);
    }
    async disconnectCalendar(req) {
        const updated = await this.userService.disconnectCalendar(req.user._id);
        if (!updated)
            throw new common_1.NotFoundException('User not found');
        return { connected: false };
    }
    async updateCustomMessage(req, dto) {
        const updated = await this.userService.updateCustomMessage(req.user._id, dto.customMessage);
        if (!updated)
            return 'failed';
        return 'updated';
    }
    async updateLocation(req, dto) {
        const updated = await this.userService.updateLocation(req.user._id, dto.location, dto.timeZone);
        if (!updated)
            throw new common_1.NotFoundException('User not found');
        return updated;
    }
    async update(req, updateUserDto) {
        const updated = await this.userService.update(req.user._id, updateUserDto);
        if (!updated)
            throw new common_1.NotFoundException('User not found');
        return updated;
    }
    async deleteAccount(req) {
        const deleted = await this.userService.deleteAccount(req.user._id);
        if (!deleted)
            throw new common_1.NotFoundException('User not found');
        return { deleted: true };
    }
};
__decorate([
    (0, common_1.Get)(),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({
        summary: '유저 확인 및 등록',
        description: '엑세스 토큰을 바탕으로 유저를 확인하고 없다면 새로 생성합니다.\n\n' +
            '앱에서 로그인 후에 꼭 호출해주세요.',
    }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], UserController.prototype, "checkAndRegister", null);
__decorate([
    (0, common_1.Patch)('device-token'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({
        summary: '디바이스 토큰 업데이트',
        description: '푸시알림을 위한 디바이스 토큰을 업데이트합니다.',
    }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, device_token_dto_1.DeviceTokenDto]),
    __metadata("design:returntype", Promise)
], UserController.prototype, "updateDeviceToken", null);
__decorate([
    (0, common_1.Patch)('calendar-token'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({
        summary: '캘린더 토큰 업데이트',
        description: '구글 캘린더 토큰을 업데이트합니다.',
    }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, calendar_token_dto_1.CalendarTokenDto]),
    __metadata("design:returntype", Promise)
], UserController.prototype, "updateCalendarToken", null);
__decorate([
    (0, common_1.Patch)('calendar-code'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({
        summary: '구글 캘린더 auth code 교환',
        description: 'Android Google Sign-In serverAuthCode를 서버에서 access/refresh token으로 교환해 저장합니다.',
    }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, calendar_code_dto_1.CalendarCodeDto]),
    __metadata("design:returntype", Promise)
], UserController.prototype, "updateCalendarTokenFromCode", null);
__decorate([
    (0, common_1.Get)('calendar-status'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({
        summary: '구글 캘린더 연동 상태 확인',
        description: '사용자의 구글 캘린더 토큰 저장 여부를 확인합니다.',
    }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], UserController.prototype, "getCalendarStatus", null);
__decorate([
    (0, common_1.Delete)('calendar-token'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({
        summary: '구글 캘린더 연동 해제',
        description: '저장된 구글 캘린더 토큰을 삭제합니다.',
    }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], UserController.prototype, "disconnectCalendar", null);
__decorate([
    (0, common_1.Patch)('custom-message'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({
        summary: '유저 커스텀 메세지 업데이트',
        description: '유저가 듣고 싶은 custom message를 업데이트합니다.',
    }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, custom_message_dto_1.CustomMessageDto]),
    __metadata("design:returntype", Promise)
], UserController.prototype, "updateCustomMessage", null);
__decorate([
    (0, common_1.Patch)('location'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({
        summary: '유저 위치 업데이트',
        description: '날씨 제공을 위한 현재 위치와 타임존을 업데이트합니다.',
    }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, location_dto_1.LocationDto]),
    __metadata("design:returntype", Promise)
], UserController.prototype, "updateLocation", null);
__decorate([
    (0, common_1.Put)(),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({
        summary: '유저 정보 업데이트',
        description: '유저 정보를 업데이트합니다.',
    }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, update_user_dto_1.UpdateUserDto]),
    __metadata("design:returntype", Promise)
], UserController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({
        summary: '계정 탈퇴',
        description: '사용자 정보와 연결된 알람, 메모리, 캘린더 토큰을 삭제합니다.',
    }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], UserController.prototype, "deleteAccount", null);
UserController = __decorate([
    (0, swagger_1.ApiTags)('User'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    (0, common_1.Controller)('user'),
    __metadata("design:paramtypes", [user_service_1.UserService])
], UserController);
exports.UserController = UserController;
//# sourceMappingURL=user.controller.js.map