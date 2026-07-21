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
exports.AlarmProcessor = void 0;
const bullmq_1 = require("@nestjs/bullmq");
const bullmq_2 = require("bullmq");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const alarm_schema_1 = require("./schemas/alarm.schema");
const alarm_service_1 = require("./alarm.service");
let AlarmProcessor = class AlarmProcessor extends bullmq_1.WorkerHost {
    constructor(alarmModel, alarmService) {
        super();
        this.alarmModel = alarmModel;
        this.alarmService = alarmService;
    }
    onModuleInit() {
        console.log('[Alarm] worker initialized');
    }
    onActive(job) {
        console.log(`[Alarm] worker active → ${job.id}`);
    }
    onCompleted(job) {
        console.log(`[Alarm] worker completed → ${job.id}`);
    }
    onFailed(job, error) {
        var _a;
        console.error(`[Alarm] worker failed → ${(_a = job === null || job === void 0 ? void 0 : job.id) !== null && _a !== void 0 ? _a : 'unknown'}`, error);
    }
    async process(job) {
        const { alarmId, oneTime, day, retry, callType, retryCount, action } = job.data;
        const alarm = await this.alarmModel.findById(alarmId);
        if (!alarm)
            return;
        if (!retry && !alarm.isOn)
            return;
        const alarmWithUser = await this.alarmService.getAlarmWithUser(alarmId);
        if (!(alarmWithUser === null || alarmWithUser === void 0 ? void 0 : alarmWithUser.user)) {
            await this.alarmService.disableOrphanedAlarm(alarmId, 'job skipped because alarm user is missing');
            return;
        }
        const isLegacyJob = !action;
        const jobAction = action || 'call';
        console.log(`🔔 Alarm ${jobAction}${retry ? ' [retry]' : ''} → ${alarmId} (${alarm.time})`);
        try {
            if (jobAction === 'prewarm') {
                await this.alarmService.prewarmCall(alarm, {
                    callType: callType || (retry ? 'retry' : 'initial'),
                    retryCount: retryCount !== null && retryCount !== void 0 ? retryCount : 0,
                });
                return;
            }
            else {
                if (isLegacyJob) {
                    try {
                        await this.alarmService.prewarmCall(alarm, {
                            callType: callType || (retry ? 'retry' : 'initial'),
                            retryCount: retryCount !== null && retryCount !== void 0 ? retryCount : 0,
                        });
                    }
                    catch (error) {
                        console.error(`[Alarm] legacy prewarm failed → ${alarmId}`, error);
                    }
                }
                await this.alarmService.call(alarm, {
                    callType: callType || (retry ? 'retry' : 'initial'),
                    retryCount: retryCount !== null && retryCount !== void 0 ? retryCount : 0,
                });
            }
        }
        catch (error) {
            console.error(`[Alarm] ${jobAction} failed → ${alarmId}`, error);
            if (jobAction === 'prewarm') {
                return;
            }
        }
        if (oneTime)
            alarm.isOn = false;
        alarm.lastTriggeredAt = new Date();
        await alarm.save();
        if (!retry && !oneTime && typeof day === 'number') {
            await this.alarmService.scheduleNextRepeatAlarm(alarm, day);
        }
    }
};
__decorate([
    (0, bullmq_1.OnWorkerEvent)('active'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [bullmq_2.Job]),
    __metadata("design:returntype", void 0)
], AlarmProcessor.prototype, "onActive", null);
__decorate([
    (0, bullmq_1.OnWorkerEvent)('completed'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [bullmq_2.Job]),
    __metadata("design:returntype", void 0)
], AlarmProcessor.prototype, "onCompleted", null);
__decorate([
    (0, bullmq_1.OnWorkerEvent)('failed'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [bullmq_2.Job, Error]),
    __metadata("design:returntype", void 0)
], AlarmProcessor.prototype, "onFailed", null);
AlarmProcessor = __decorate([
    (0, bullmq_1.Processor)('alarm'),
    __param(0, (0, mongoose_1.InjectModel)(alarm_schema_1.Alarm.name)),
    __metadata("design:paramtypes", [mongoose_2.Model,
        alarm_service_1.AlarmService])
], AlarmProcessor);
exports.AlarmProcessor = AlarmProcessor;
//# sourceMappingURL=alarm.processor.js.map