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
/// <reference types="mongoose" />
/// <reference types="mongoose/types/schematypes" />
/// <reference types="mongoose/types/inferschematype" />
/// <reference types="mongoose/types/inferrawdoctype" />
import { UserService } from './user.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { DeviceTokenDto } from './dto/device-token.dto';
import { CalendarTokenDto } from './dto/calendar-token.dto';
import { CustomMessageDto } from './dto/custom-message.dto';
import { LocationDto } from './dto/location.dto';
import { CalendarCodeDto } from './dto/calendar-code.dto';
export declare class UserController {
    private readonly userService;
    constructor(userService: UserService);
    checkAndRegister(req: any): any;
    updateDeviceToken(req: any, dto: DeviceTokenDto): Promise<"failed" | "updated">;
    updateCalendarToken(req: any, dto: CalendarTokenDto): Promise<"failed" | "updated">;
    updateCalendarTokenFromCode(req: any, dto: CalendarCodeDto): Promise<{
        connected: boolean;
    }>;
    getCalendarStatus(req: any): Promise<{
        connected: boolean;
    }>;
    disconnectCalendar(req: any): Promise<{
        connected: boolean;
    }>;
    updateCustomMessage(req: any, dto: CustomMessageDto): Promise<"failed" | "updated">;
    updateLocation(req: any, dto: LocationDto): Promise<import("mongoose").FlattenMaps<import("./schemas/user.schema").UserDocument> & Required<{
        _id: import("mongoose").FlattenMaps<unknown>;
    }> & {
        __v: number;
    }>;
    update(req: any, updateUserDto: UpdateUserDto): Promise<import("mongoose").FlattenMaps<import("./schemas/user.schema").UserDocument> & Required<{
        _id: import("mongoose").FlattenMaps<unknown>;
    }> & {
        __v: number;
    }>;
    deleteAccount(req: any): Promise<{
        deleted: boolean;
    }>;
}
