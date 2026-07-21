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
import { AlarmService } from './alarm.service';
import { AlarmDto } from './dto/alarm.dto';
import { TestCallDto } from './dto/test-call.dto';
import { RetryAlarmDto } from './dto/retry-alarm.dto';
import { ReportCallOutcomeDto } from './dto/report-call-outcome.dto';
export declare class AlarmController {
    private readonly alarmService;
    constructor(alarmService: AlarmService);
    create(req: any, dto: AlarmDto): Promise<(import("./schemas/alarm.schema").Alarm & import("mongoose").Document<unknown, any, any, Record<string, any>> & Required<{
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
    }>;
    findAll(req: any): Promise<((import("mongoose").FlattenMaps<import("./schemas/alarm.schema").AlarmDocument> & Required<{
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
    })[]>;
    update(req: any, id: string, dto: AlarmDto): Promise<(import("./schemas/alarm.schema").Alarm & import("mongoose").Document<unknown, any, any, Record<string, any>> & Required<{
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
    }>;
    delete(req: any, id: string): Promise<import("mongoose").Document<unknown, {}, import("./schemas/alarm.schema").AlarmDocument, {}> & import("./schemas/alarm.schema").Alarm & import("mongoose").Document<unknown, any, any, Record<string, any>> & Required<{
        _id: unknown;
    }> & {
        __v: number;
    }>;
    testCall(req: any, dto: TestCallDto): Promise<{
        lkToken: string;
        lkUrl: string;
    }>;
    retry(dto: RetryAlarmDto): Promise<{
        success: boolean;
        limitReached: boolean;
        alarmId: string;
        retryMinutes: number;
        message: string;
        retryCount?: undefined;
        scheduledAt?: undefined;
    } | {
        success: boolean;
        alarmId: string;
        retryCount: number;
        retryMinutes: number;
        scheduledAt: string;
        limitReached?: undefined;
        message?: undefined;
    }>;
    reportCallOutcome(dto: ReportCallOutcomeDto): Promise<{
        success: boolean;
        action: string;
        wakeStatus: "awake";
        message: string;
        retryLimit?: undefined;
        push?: undefined;
    } | {
        success: boolean;
        limitReached: boolean;
        alarmId: string;
        retryMinutes: number;
        message: string;
        retryCount?: undefined;
        scheduledAt?: undefined;
        action: string;
        wakeStatus: "not_awake" | "retry_requested" | "no_response" | "rejected";
        retryLimit?: undefined;
        push?: undefined;
    } | {
        success: boolean;
        alarmId: string;
        retryCount: number;
        retryMinutes: number;
        scheduledAt: string;
        limitReached?: undefined;
        message?: undefined;
        action: string;
        wakeStatus: "not_awake" | "retry_requested" | "no_response" | "rejected";
        retryLimit?: undefined;
        push?: undefined;
    } | {
        success: boolean;
        action: string;
        wakeStatus: "not_awake" | "retry_requested" | "no_response" | "rejected";
        retryLimit: number;
        message: string;
        push: {
            success: boolean;
            skipped: boolean;
            message: string;
            sent?: undefined;
            failed?: undefined;
        } | {
            success: boolean;
            sent: number;
            failed: number;
            skipped?: undefined;
            message?: undefined;
        };
    }>;
}
