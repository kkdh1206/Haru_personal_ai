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
exports.AlarmController = void 0;
const common_1 = require("@nestjs/common");
const alarm_service_1 = require("./alarm.service");
const alarm_dto_1 = require("./dto/alarm.dto");
const swagger_1 = require("@nestjs/swagger");
const auth_guard_1 = require("../auth/auth.guard");
const test_call_dto_1 = require("./dto/test-call.dto");
const retry_alarm_dto_1 = require("./dto/retry-alarm.dto");
const report_call_outcome_dto_1 = require("./dto/report-call-outcome.dto");
let AlarmController = class AlarmController {
    constructor(alarmService) {
        this.alarmService = alarmService;
    }
    async create(req, dto) {
        return this.alarmService.createAlarm(req.user._id, dto);
    }
    async findAll(req) {
        return this.alarmService.findAllAlarms(req.user._id);
    }
    async update(req, id, dto) {
        return this.alarmService.updateAlarm(req.user._id.toString(), id, dto);
    }
    async delete(req, id) {
        return this.alarmService.deleteAlarm(req.user._id.toString(), id);
    }
    async testCall(req, dto) {
        return this.alarmService.testCall(req.user, dto);
    }
    async retry(dto) {
        return this.alarmService.scheduleRetryCall(dto.alarmId, dto.retryMinutes);
    }
    async reportCallOutcome(dto) {
        return this.alarmService.handleCallOutcome(dto);
    }
};
__decorate([
    (0, common_1.Post)(),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({
        summary: '알람 생성',
        description: '알람을 생성합니다.',
    }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, alarm_dto_1.AlarmDto]),
    __metadata("design:returntype", Promise)
], AlarmController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({
        summary: '알람 조회',
        description: '알람을 조회합니다.',
    }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AlarmController.prototype, "findAll", null);
__decorate([
    (0, common_1.Put)(':id'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({
        summary: '알람 수정',
        description: '알람을 수정합니다.',
    }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, alarm_dto_1.AlarmDto]),
    __metadata("design:returntype", Promise)
], AlarmController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({
        summary: '알람 삭제',
        description: '알람을 삭제합니다.',
    }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], AlarmController.prototype, "delete", null);
__decorate([
    (0, common_1.Post)('test-call'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({
        summary: '테스트 전화',
        description: '테스트 전화를 위한 토큰을 발급합니다.',
    }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, test_call_dto_1.TestCallDto]),
    __metadata("design:returntype", Promise)
], AlarmController.prototype, "testCall", null);
__decorate([
    (0, common_1.Post)('retry'),
    (0, swagger_1.ApiOperation)({
        summary: '알람 재통화 예약',
        description: '현재 알람 통화가 끝난 뒤 몇 분 후 다시 전화하도록 예약합니다.',
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [retry_alarm_dto_1.RetryAlarmDto]),
    __metadata("design:returntype", Promise)
], AlarmController.prototype, "retry", null);
__decorate([
    (0, common_1.Post)('call-outcome'),
    (0, swagger_1.ApiOperation)({
        summary: '알람 통화 결과 보고',
        description: '에이전트가 통화 종료 후 wake 상태를 보고하고 후속 재통화 여부를 결정합니다.',
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [report_call_outcome_dto_1.ReportCallOutcomeDto]),
    __metadata("design:returntype", Promise)
], AlarmController.prototype, "reportCallOutcome", null);
AlarmController = __decorate([
    (0, common_1.Controller)('alarm'),
    __metadata("design:paramtypes", [alarm_service_1.AlarmService])
], AlarmController);
exports.AlarmController = AlarmController;
//# sourceMappingURL=alarm.controller.js.map