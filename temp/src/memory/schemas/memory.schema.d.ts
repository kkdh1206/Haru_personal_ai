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
export type MemoryDocument = Memory & Document;
export type MemoryType = 'legacy_message' | 'call_record' | 'long_term_memory' | 'reminder';
export declare class Memory {
    userId: Types.ObjectId;
    conversationId: string;
    memoryType: MemoryType;
    role: 'user' | 'assistant' | 'system';
    content: string;
    summary: string | null;
    metadata: {
        importantData?: any;
        tags?: string[];
        [key: string]: any;
    };
    chromaId: string | null;
    normalizedContent: string | null;
    timestamp: Date;
}
export declare const MemorySchema: import("mongoose").Schema<Memory, import("mongoose").Model<Memory, any, any, any, Document<unknown, any, Memory, any> & Memory & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, any>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, Memory, Document<unknown, {}, import("mongoose").FlatRecord<Memory>, {}> & import("mongoose").FlatRecord<Memory> & {
    _id: Types.ObjectId;
} & {
    __v: number;
}>;
