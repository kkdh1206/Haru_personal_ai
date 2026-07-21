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
exports.UserService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const user_schema_1 = require("./schemas/user.schema");
const crypto_service_1 = require("../utils/crypto.service");
const alarm_schema_1 = require("../alarm/schemas/alarm.schema");
const memory_schema_1 = require("../memory/schemas/memory.schema");
const user_profile_schema_1 = require("../memory/schemas/user-profile.schema");
const config_1 = require("@nestjs/config");
const googleapis_1 = require("googleapis");
let UserService = class UserService {
    constructor(userModel, alarmModel, memoryModel, userProfileModel, crypto, cs) {
        this.userModel = userModel;
        this.alarmModel = alarmModel;
        this.memoryModel = memoryModel;
        this.userProfileModel = userProfileModel;
        this.crypto = crypto;
        this.cs = cs;
    }
    async oauthSync(firebaseUid, email) {
        let user = await this.userModel.findOne({ firebaseUid }).lean();
        if (user) {
            return user;
        }
        try {
            user = await this.userModel.create({ firebaseUid, email });
            return user;
        }
        catch (err) {
            if (err.code === 11000) {
                throw new common_1.ConflictException('User already exists with this firebaseUid');
            }
            throw err;
        }
    }
    async findOne(id) {
        return this.userModel.findById(id).lean();
    }
    async update(userId, updateUserDto) {
        const $set = {};
        if (updateUserDto.name !== undefined) {
            const name = updateUserDto.name.trim();
            if (name)
                $set.name = name;
        }
        if (updateUserDto.interest !== undefined)
            $set.interest = updateUserDto.interest;
        if (updateUserDto.location !== undefined)
            $set.location = updateUserDto.location;
        if (updateUserDto.language !== undefined)
            $set.language = updateUserDto.language;
        return this.userModel
            .findByIdAndUpdate({ _id: userId }, { $set }, { new: true })
            .lean();
    }
    updateLocation(userId, location, timeZone) {
        const $set = { location };
        if (timeZone)
            $set.timeZone = timeZone;
        return this.userModel
            .findByIdAndUpdate({ _id: userId }, { $set }, { new: true })
            .lean();
    }
    async updateCustomMessage(userId, newMessage) {
        const user = await this.userModel.findById(userId);
        if (!user)
            return null;
        user.customMessage = newMessage;
        return await user.save();
    }
    updateDeviceToken(userId, deviceToken, deviceType = 'ios', notificationToken) {
        const $set = { deviceToken, deviceType };
        if (notificationToken) {
            $set.notificationToken = notificationToken;
        }
        return this.userModel
            .findByIdAndUpdate({ _id: userId }, { $set }, { new: true })
            .lean();
    }
    getUserDeviceToken(userId) {
        return this.userModel
            .findById(userId)
            .select('deviceToken notificationToken deviceType')
            .lean();
    }
    updateCalendarToken(userId, calendarAccessToken, calendarRefreshToken) {
        return this.userModel
            .findByIdAndUpdate({ _id: userId }, {
            $set: {
                calendarAccessToken: this.crypto.encrypt(calendarAccessToken),
                calendarRefreshToken: this.crypto.encrypt(calendarRefreshToken),
            },
        }, { new: true })
            .lean();
    }
    async updateCalendarTokenFromAuthCode(userId, serverAuthCode) {
        const oAuth2Client = new googleapis_1.google.auth.OAuth2(this.cs.get('google.clientId'), this.cs.get('google.clientSecret'));
        const { tokens } = await oAuth2Client.getToken(serverAuthCode);
        if (!tokens.access_token || !tokens.refresh_token) {
            throw new Error('Google Calendar auth code did not return tokens.');
        }
        await this.updateCalendarToken(userId, tokens.access_token, tokens.refresh_token);
        return { connected: true };
    }
    async getUserCalendarToken(userId) {
        const user = await this.userModel
            .findById(userId)
            .select('calendarAccessToken calendarRefreshToken')
            .lean();
        if (!user)
            throw new common_1.NotFoundException('User not found');
        if (!user.calendarAccessToken || !user.calendarRefreshToken)
            throw new common_1.NotFoundException('Calendar token not found');
        return {
            calendarAccessToken: this.crypto.decrypt(user.calendarAccessToken),
            calendarRefreshToken: this.crypto.decrypt(user.calendarRefreshToken),
        };
    }
    async getCalendarStatus(userId) {
        const user = await this.userModel
            .findById(userId)
            .select('calendarAccessToken calendarRefreshToken')
            .lean();
        if (!user)
            throw new common_1.NotFoundException('User not found');
        return {
            connected: Boolean(user.calendarAccessToken && user.calendarRefreshToken),
        };
    }
    disconnectCalendar(userId) {
        return this.userModel
            .findByIdAndUpdate({ _id: userId }, { $unset: { calendarAccessToken: '', calendarRefreshToken: '' } }, { new: true })
            .lean();
    }
    async deleteAccount(userId) {
        const user = await this.userModel.findById(userId).select('_id').lean();
        if (!user)
            return null;
        await Promise.all([
            this.alarmModel.deleteMany({ userId }),
            this.memoryModel.deleteMany({ userId }),
            this.userProfileModel.deleteOne({ userId }),
        ]);
        return this.userModel.findByIdAndDelete(userId).lean();
    }
};
UserService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(user_schema_1.User.name)),
    __param(1, (0, mongoose_1.InjectModel)(alarm_schema_1.Alarm.name)),
    __param(2, (0, mongoose_1.InjectModel)(memory_schema_1.Memory.name)),
    __param(3, (0, mongoose_1.InjectModel)(user_profile_schema_1.UserProfile.name)),
    __metadata("design:paramtypes", [mongoose_2.Model,
        mongoose_2.Model,
        mongoose_2.Model,
        mongoose_2.Model,
        crypto_service_1.CryptoService,
        config_1.ConfigService])
], UserService);
exports.UserService = UserService;
//# sourceMappingURL=user.service.js.map