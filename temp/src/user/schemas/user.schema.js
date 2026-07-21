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
exports.UserSchema = exports.User = void 0;
const mongoose_1 = require("@nestjs/mongoose");
let User = class User {
};
__decorate([
    (0, mongoose_1.Prop)({ required: true, unique: true, nullable: true }),
    __metadata("design:type", String)
], User.prototype, "firebaseUid", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, unique: true, nullable: true }),
    __metadata("design:type", String)
], User.prototype, "email", void 0);
__decorate([
    (0, mongoose_1.Prop)({ nullable: true }),
    __metadata("design:type", String)
], User.prototype, "name", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 'Asia/Seoul' }),
    __metadata("design:type", String)
], User.prototype, "timeZone", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 'false' }),
    __metadata("design:type", Boolean)
], User.prototype, "isSubscribed", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: '한국어' }),
    __metadata("design:type", String)
], User.prototype, "language", void 0);
__decorate([
    (0, mongoose_1.Prop)({ nullable: true }),
    __metadata("design:type", String)
], User.prototype, "location", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 'korea-top' }),
    __metadata("design:type", String)
], User.prototype, "interest", void 0);
__decorate([
    (0, mongoose_1.Prop)({ nullable: true }),
    __metadata("design:type", String)
], User.prototype, "deviceToken", void 0);
__decorate([
    (0, mongoose_1.Prop)({ nullable: true }),
    __metadata("design:type", String)
], User.prototype, "notificationToken", void 0);
__decorate([
    (0, mongoose_1.Prop)({ nullable: true }),
    __metadata("design:type", String)
], User.prototype, "deviceType", void 0);
__decorate([
    (0, mongoose_1.Prop)({ nullable: true }),
    __metadata("design:type", String)
], User.prototype, "calendarAccessToken", void 0);
__decorate([
    (0, mongoose_1.Prop)({ nullable: true }),
    __metadata("design:type", String)
], User.prototype, "calendarRefreshToken", void 0);
__decorate([
    (0, mongoose_1.Prop)({ nullable: true }),
    __metadata("design:type", String)
], User.prototype, "customMessage", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 'user', enum: ['user', 'admin'] }),
    __metadata("design:type", String)
], User.prototype, "role", void 0);
User = __decorate([
    (0, mongoose_1.Schema)({
        timestamps: true,
        collection: 'users',
    })
], User);
exports.User = User;
exports.UserSchema = mongoose_1.SchemaFactory.createForClass(User);
//# sourceMappingURL=user.schema.js.map