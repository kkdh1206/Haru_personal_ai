/// <reference types="mongoose/types/aggregate" />
/// <reference types="mongoose/types/callback" />
/// <reference types="mongoose/types/collection" />
/// <reference types="mongoose/types/connection" />
/// <reference types="mongoose/types/cursor" />
/// <reference types="mongoose/types/document" />
/// <reference types="mongoose/types/error" />
/// <reference types="mongoose/types/expressions" />
/// <reference types="mongoose/types/helpers" />
/// <reference types="mongoose/types/middlewares" />
/// <reference types="mongoose/types/indexes" />
/// <reference types="mongoose/types/models" />
/// <reference types="mongoose/types/mongooseoptions" />
/// <reference types="mongoose/types/pipelinestage" />
/// <reference types="mongoose/types/populate" />
/// <reference types="mongoose/types/query" />
/// <reference types="mongoose/types/schemaoptions" />
/// <reference types="mongoose/types/session" />
/// <reference types="mongoose/types/types" />
/// <reference types="mongoose/types/utility" />
/// <reference types="mongoose/types/validation" />
/// <reference types="mongoose/types/virtuals" />
/// <reference types="mongoose/types/schematypes" />
/// <reference types="mongoose/types/inferschematype" />
/// <reference types="mongoose/types/inferrawdoctype" />
import { Model, Types } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { UpdateUserDto } from './dto/update-user.dto';
import { CryptoService } from 'src/utils/crypto.service';
import { AlarmDocument } from 'src/alarm/schemas/alarm.schema';
import { MemoryDocument } from 'src/memory/schemas/memory.schema';
import { UserProfileDocument } from 'src/memory/schemas/user-profile.schema';
import { ConfigService } from '@nestjs/config';
export declare class UserService {
    private userModel;
    private alarmModel;
    private memoryModel;
    private userProfileModel;
    private readonly crypto;
    private readonly cs;
    constructor(userModel: Model<UserDocument>, alarmModel: Model<AlarmDocument>, memoryModel: Model<MemoryDocument>, userProfileModel: Model<UserProfileDocument>, crypto: CryptoService, cs: ConfigService);
    oauthSync(firebaseUid: string, email: string): Promise<import("mongoose").FlattenMaps<UserDocument> & Required<{
        _id: import("mongoose").FlattenMaps<unknown>;
    }> & {
        __v: number;
    }>;
    findOne(id: Types.ObjectId): Promise<User | null>;
    update(userId: string, updateUserDto: UpdateUserDto): Promise<import("mongoose").FlattenMaps<UserDocument> & Required<{
        _id: import("mongoose").FlattenMaps<unknown>;
    }> & {
        __v: number;
    }>;
    updateLocation(userId: string, location: string, timeZone?: string): import("mongoose").Query<import("mongoose").FlattenMaps<UserDocument> & Required<{
        _id: import("mongoose").FlattenMaps<unknown>;
    }> & {
        __v: number;
    }, import("mongoose").Document<unknown, {}, UserDocument, {}> & User & import("mongoose").Document<unknown, any, any, Record<string, any>> & Required<{
        _id: unknown;
    }> & {
        __v: number;
    }, {}, UserDocument, "findOneAndUpdate", {}>;
    updateCustomMessage(userId: string, newMessage: string): Promise<User | null>;
    updateDeviceToken(userId: string, deviceToken: string, deviceType?: 'ios' | 'android', notificationToken?: string): import("mongoose").Query<import("mongoose").FlattenMaps<UserDocument> & Required<{
        _id: import("mongoose").FlattenMaps<unknown>;
    }> & {
        __v: number;
    }, import("mongoose").Document<unknown, {}, UserDocument, {}> & User & import("mongoose").Document<unknown, any, any, Record<string, any>> & Required<{
        _id: unknown;
    }> & {
        __v: number;
    }, {}, UserDocument, "findOneAndUpdate", {}>;
    getUserDeviceToken(userId: string): import("mongoose").Query<import("mongoose").FlattenMaps<UserDocument> & Required<{
        _id: import("mongoose").FlattenMaps<unknown>;
    }> & {
        __v: number;
    }, import("mongoose").Document<unknown, {}, UserDocument, {}> & User & import("mongoose").Document<unknown, any, any, Record<string, any>> & Required<{
        _id: unknown;
    }> & {
        __v: number;
    }, {}, UserDocument, "findOne", {}>;
    updateCalendarToken(userId: string, calendarAccessToken: string, calendarRefreshToken: string): import("mongoose").Query<import("mongoose").FlattenMaps<UserDocument> & Required<{
        _id: import("mongoose").FlattenMaps<unknown>;
    }> & {
        __v: number;
    }, import("mongoose").Document<unknown, {}, UserDocument, {}> & User & import("mongoose").Document<unknown, any, any, Record<string, any>> & Required<{
        _id: unknown;
    }> & {
        __v: number;
    }, {}, UserDocument, "findOneAndUpdate", {}>;
    updateCalendarTokenFromAuthCode(userId: string, serverAuthCode: string): Promise<{
        connected: boolean;
    }>;
    getUserCalendarToken(userId: string): Promise<{
        calendarAccessToken: string;
        calendarRefreshToken: string;
    }>;
    getCalendarStatus(userId: string): Promise<{
        connected: boolean;
    }>;
    disconnectCalendar(userId: string): import("mongoose").Query<import("mongoose").FlattenMaps<UserDocument> & Required<{
        _id: import("mongoose").FlattenMaps<unknown>;
    }> & {
        __v: number;
    }, import("mongoose").Document<unknown, {}, UserDocument, {}> & User & import("mongoose").Document<unknown, any, any, Record<string, any>> & Required<{
        _id: unknown;
    }> & {
        __v: number;
    }, {}, UserDocument, "findOneAndUpdate", {}>;
    deleteAccount(userId: string): Promise<import("mongoose").FlattenMaps<UserDocument> & Required<{
        _id: import("mongoose").FlattenMaps<unknown>;
    }> & {
        __v: number;
    }>;
}
