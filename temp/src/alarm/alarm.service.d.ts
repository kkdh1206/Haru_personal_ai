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
import { OnModuleInit } from '@nestjs/common';
import { Alarm, AlarmDocument } from './schemas/alarm.schema';
import { Model, Types } from 'mongoose';
import { AlarmDto } from './dto/alarm.dto';
import { UserService } from 'src/user/user.service';
import { ApnsService } from 'src/apns/apns.service';
import { Queue } from 'bullmq';
import { LivekitService } from 'src/livekit/livekit.service';
import { PromptService } from 'src/prompt/prompt.service';
import { TestCallDto } from './dto/test-call.dto';
import { ConfigService } from '@nestjs/config';
import { ReportCallOutcomeDto } from './dto/report-call-outcome.dto';
import { FcmService } from 'src/fcm/fcm.service';
type AlarmCallType = 'initial' | 'retry';
type WakeIntensity = 'gentle' | 'firm';
export declare class AlarmService implements OnModuleInit {
    private readonly livekit;
    private readonly apnsService;
    private readonly fcmService;
    private readonly userService;
    private readonly promptService;
    private alarmModel;
    private alarmQueue;
    private readonly cs;
    private readonly livekitUrl;
    private readonly prewarmLeadMs;
    private readonly defaultRetryMinutes;
    private readonly maxDailyRetryCalls;
    private readonly callAgentCheckTimeoutMs;
    constructor(livekit: LivekitService, apnsService: ApnsService, fcmService: FcmService, userService: UserService, promptService: PromptService, alarmModel: Model<AlarmDocument>, alarmQueue: Queue, cs: ConfigService);
    getMaxDailyRetryCalls(): number;
    onModuleInit(): Promise<void>;
    private getPositiveConfigNumber;
    private getNonNegativeConfigNumber;
    private normalizeAlarmPayload;
    private normalizeWakeIntensity;
    private getLocalDateKey;
    private fallbackPrompt;
    private resetDailyRetryStateIfNeeded;
    private serializeAlarm;
    createAlarm(userId: string, dto: AlarmDto): Promise<(Alarm & import("mongoose").Document<unknown, any, any, Record<string, any>> & Required<{
        _id: unknown;
    }> & {
        __v: number;
    } & {
        toObject?: () => Record<string, any>;
    }) | {
        role: string;
        voice: string;
        personality: WakeIntensity;
        wakeIntensity: WakeIntensity;
    }>;
    findAllAlarms(userId: string): Promise<((import("mongoose").FlattenMaps<AlarmDocument> & Required<{
        _id: import("mongoose").FlattenMaps<unknown>;
    }> & {
        __v: number;
    } & {
        toObject?: () => Record<string, any>;
    }) | {
        role: string;
        voice: string;
        personality: WakeIntensity;
        wakeIntensity: WakeIntensity;
    })[]>;
    updateAlarm(userId: string, id: string, dto: AlarmDto): Promise<(Alarm & import("mongoose").Document<unknown, any, any, Record<string, any>> & Required<{
        _id: unknown;
    }> & {
        __v: number;
    } & {
        toObject?: () => Record<string, any>;
    }) | {
        role: string;
        voice: string;
        personality: WakeIntensity;
        wakeIntensity: WakeIntensity;
    }>;
    deleteAlarm(userId: string, id: string): Promise<import("mongoose").Document<unknown, {}, AlarmDocument, {}> & Alarm & import("mongoose").Document<unknown, any, any, Record<string, any>> & Required<{
        _id: unknown;
    }> & {
        __v: number;
    }>;
    private recoverActiveAlarms;
    private scheduleAlarm;
    scheduleNextRepeatAlarm(alarm: AlarmDocument, day: number): Promise<void>;
    disableOrphanedAlarm(alarmId: string, reason?: string): Promise<void>;
    private scheduleRepeatDay;
    private scheduleCallJobs;
    private addScheduledJob;
    private nextDayOfWeek;
    private nextOnce;
    private clearJobs;
    private removeJobs;
    findOne(id: Types.ObjectId): Promise<Alarm | null>;
    getAlarmWithUser(alarmId: string): Promise<(import("mongoose").FlattenMaps<AlarmDocument> & Required<{
        _id: import("mongoose").FlattenMaps<unknown>;
    }> & {
        __v: number;
    } & {
        toObject?: () => Record<string, any>;
    }) | {
        role: string;
        voice: string;
        personality: WakeIntensity;
        wakeIntensity: WakeIntensity;
    }>;
    private sendRetryLimitPush;
    private buildPromptForAlarm;
    prewarmCall(alarm: any, options?: {
        callType?: AlarmCallType;
        retryCount?: number;
    }): Promise<void>;
    call(alarm: any, options?: {
        callType?: AlarmCallType;
        retryCount?: number;
    }): Promise<void>;
    testCall(user: any, dto: TestCallDto): Promise<{
        lkToken: string;
        lkUrl: string;
    }>;
    scheduleRetryCall(alarmId: string, retryMinutes?: number): Promise<{
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
    private scheduleRetryCallForAlarm;
    handleCallOutcome(dto: ReportCallOutcomeDto): Promise<{
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
    private clearRetryJobs;
}
export {};
