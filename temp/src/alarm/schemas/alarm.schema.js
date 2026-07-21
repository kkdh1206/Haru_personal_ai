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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AlarmSchema = exports.Alarm = void 0;
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
let Alarm = class Alarm {
};
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'User', required: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], Alarm.prototype, "userId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 'bright' }),
    __metadata("design:type", String)
], Alarm.prototype, "personality", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 'Rasalgethi' }),
    __metadata("design:type", String)
], Alarm.prototype, "voice", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, default: '하루' }),
    __metadata("design:type", String)
], Alarm.prototype, "role", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 'gentle' }),
    __metadata("design:type", String)
], Alarm.prototype, "wakeIntensity", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Alarm.prototype, "time", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: null }),
    __metadata("design:type", String)
], Alarm.prototype, "targetDate", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, default: 'Asia/Seoul' }),
    __metadata("design:type", String)
], Alarm.prototype, "timeZone", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: true }),
    __metadata("design:type", Boolean)
], Alarm.prototype, "isOn", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: [Number], default: [] }),
    __metadata("design:type", Array)
], Alarm.prototype, "repeatDays", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: null }),
    __metadata("design:type", Date)
], Alarm.prototype, "lastTriggeredAt", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 0 }),
    __metadata("design:type", Number)
], Alarm.prototype, "dailyRetryCount", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: null }),
    __metadata("design:type", String)
], Alarm.prototype, "retryTrackingDate", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 'initial', enum: ['initial', 'retry'] }),
    __metadata("design:type", String)
], Alarm.prototype, "lastCallType", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: null }),
    __metadata("design:type", String)
], Alarm.prototype, "lastWakeStatus", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: null }),
    __metadata("design:type", Date)
], Alarm.prototype, "lastRetryScheduledAt", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: null }),
    __metadata("design:type", String)
], Alarm.prototype, "retryLimitNoticeDate", void 0);
Alarm = __decorate([
    (0, mongoose_1.Schema)({
        timestamps: true,
        collection: 'alarms',
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    })
], Alarm);
exports.Alarm = Alarm;
exports.AlarmSchema = mongoose_1.SchemaFactory.createForClass(Alarm);
exports.AlarmSchema.virtual('user', {
    ref: 'User',
    localField: 'userId',
    foreignField: '_id',
    justOne: true,
});
//# sourceMappingURL=alarm.schema.js.map