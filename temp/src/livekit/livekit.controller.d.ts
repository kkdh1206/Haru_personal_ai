import { LivekitService } from './livekit.service';
import { ConfigService } from '@nestjs/config';
export declare class LivekitController {
    private readonly livekitService;
    private readonly cs;
    private readonly livekitUrl;
    constructor(livekitService: LivekitService, cs: ConfigService);
    getToken(req: any): Promise<{
        lkToken: string;
        lkUrl: string;
    }>;
    getRoomInfos(roomName: string): Promise<any>;
}
