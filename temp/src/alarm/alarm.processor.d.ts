import { OnModuleInit } from '@nestjs/common';
import { WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Model } from 'mongoose';
import { AlarmDocument } from './schemas/alarm.schema';
import { AlarmService } from './alarm.service';
export declare class AlarmProcessor extends WorkerHost implements OnModuleInit {
    private alarmModel;
    private alarmService;
    constructor(alarmModel: Model<AlarmDocument>, alarmService: AlarmService);
    onModuleInit(): void;
    onActive(job: Job): void;
    onCompleted(job: Job): void;
    onFailed(job: Job | undefined, error: Error): void;
    process(job: Job<{
        alarmId: string;
        oneTime?: boolean;
        day?: number;
        retry?: boolean;
        retryMinutes?: number;
        callType?: 'initial' | 'retry';
        retryCount?: number;
        action?: 'prewarm' | 'call';
    }>): Promise<void>;
}
