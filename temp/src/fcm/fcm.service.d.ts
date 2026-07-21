type FcmResult = {
    sent: string[];
    failed: {
        token: string;
        error: unknown;
    }[];
};
export declare class FcmService {
    sendCallPush(token: string, payload: {
        caller: string;
        lkUrl: string;
        lkToken: string;
        alarmId: string;
    }): Promise<FcmResult>;
    sendWakeFollowupPush(token: string, body: string): Promise<FcmResult>;
    private sendDataMessage;
}
export {};
