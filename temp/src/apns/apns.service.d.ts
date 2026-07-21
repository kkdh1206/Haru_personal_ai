import { OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import apn from 'apn';
export declare class ApnsService implements OnModuleDestroy {
    private readonly cs;
    private provider;
    private livekitUrl;
    constructor(cs: ConfigService);
    private applyPushHeaders;
    sendVoipPush(token: string, payload: {
        caller: string;
        livekitToken: string;
        alarmId: string;
    }): Promise<apn.Responses>;
    sendWakeFollowupPush(token: string, body: string): Promise<apn.Responses>;
    onModuleDestroy(): void;
}
