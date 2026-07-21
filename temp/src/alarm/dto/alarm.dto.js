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
exports.AlarmDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class AlarmDto {
    constructor() {
        this.personality = 'gentle';
        this.voice = 'Rasalgethi';
        this.role = '하루';
        this.wakeIntensity = 'gentle';
    }
}
__decorate([
    (0, swagger_1.ApiProperty)({ default: 'gentle' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], AlarmDto.prototype, "personality", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ default: 'Rasalgethi' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], AlarmDto.prototype, "voice", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ required: false, default: '하루' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], AlarmDto.prototype, "role", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ required: false, default: 'gentle' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], AlarmDto.prototype, "wakeIntensity", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ required: true, default: '09:00' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AlarmDto.prototype, "time", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ required: false, default: null }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], AlarmDto.prototype, "targetDate", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ required: true, default: 'Asia/Seoul' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AlarmDto.prototype, "timeZone", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: Boolean, default: true }),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], AlarmDto.prototype, "isOn", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [Number], default: [] }),
    (0, class_validator_1.IsArray)(),
    __metadata("design:type", Array)
], AlarmDto.prototype, "repeatDays", void 0);
exports.AlarmDto = AlarmDto;
//# sourceMappingURL=alarm.dto.js.map