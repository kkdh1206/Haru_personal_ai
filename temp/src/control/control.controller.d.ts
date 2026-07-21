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
import { ControlCommandDto } from './dto/control-command.dto';
import { ControlService } from './control.service';
export declare class ControlController {
    private readonly controlService;
    constructor(controlService: ControlService);
    handleChat(req: any, dto: ControlCommandDto): Promise<{
        intent: "set_alarm";
        success: boolean;
        reply: string;
        data?: undefined;
    } | {
        intent: "set_alarm";
        success: boolean;
        reply: string;
        data: (import("../alarm/schemas/alarm.schema").Alarm & import("mongoose").Document<unknown, any, any, Record<string, any>> & Required<{
            _id: unknown;
        }> & {
            __v: number;
        } & {
            toObject?: () => Record<string, any>;
        }) | {
            role: string;
            voice: string;
            personality: "gentle" | "firm";
            wakeIntensity: "gentle" | "firm";
        };
    } | {
        intent: "update_memory";
        success: boolean;
        reply: string;
        data?: undefined;
    } | {
        intent: "update_memory";
        success: boolean;
        reply: string;
        data: Record<string, any>;
    } | {
        intent: "get_info";
        success: boolean;
        reply: string;
        data: {
            id: string;
            summary: string;
            description: string;
            start: string;
            end: string;
            location: string;
        }[];
    } | {
        intent: "get_info";
        success: boolean;
        reply: string;
        data: ((import("mongoose").FlattenMaps<import("../alarm/schemas/alarm.schema").AlarmDocument> & Required<{
            _id: import("mongoose").FlattenMaps<unknown>;
        }> & {
            __v: number;
        } & {
            toObject?: () => Record<string, any>;
        }) | {
            role: string;
            voice: string;
            personality: "gentle" | "firm";
            wakeIntensity: "gentle" | "firm";
        })[];
    } | {
        intent: "retry_request";
        success: boolean;
        reply: string;
        data?: undefined;
    } | {
        intent: "unknown";
        success: boolean;
        reply: string;
        data?: undefined;
    }>;
}
