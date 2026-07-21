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
import { Document, Types } from 'mongoose';
export type AlarmDocument = Alarm & Document;
export declare class Alarm {
    userId: Types.ObjectId;
    personality: string;
    voice: string;
    role: string;
    wakeIntensity: 'gentle' | 'firm';
    time: string;
    targetDate?: string | null;
    timeZone: string;
    isOn: boolean;
    repeatDays: number[];
    lastTriggeredAt: Date | null;
    dailyRetryCount: number;
    retryTrackingDate: string | null;
    lastCallType: 'initial' | 'retry';
    lastWakeStatus: 'awake' | 'not_awake' | 'retry_requested' | 'no_response' | 'rejected' | null;
    lastRetryScheduledAt: Date | null;
    retryLimitNoticeDate: string | null;
}
export declare const AlarmSchema: import("mongoose").Schema<Alarm, import("mongoose").Model<Alarm, any, any, any, Document<unknown, any, Alarm, any> & Alarm & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, any>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, Alarm, Document<unknown, {}, import("mongoose").FlatRecord<Alarm>, {}> & import("mongoose").FlatRecord<Alarm> & {
    _id: Types.ObjectId;
} & {
    __v: number;
}>;
