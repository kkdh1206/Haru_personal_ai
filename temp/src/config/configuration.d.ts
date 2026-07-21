declare const _default: () => {
    mongo: {
        uri: string;
        dbName: string;
    };
    agora: {
        appId: string;
        cert: string;
    };
    agent: {
        url: string;
    };
    apns: {
        keyId: string;
        teamId: string;
        bundleId: string;
        production: boolean;
    };
    google: {
        clientId: string;
        clientSecret: string;
    };
    weather: {
        apiKey: string;
    };
    encryption: {
        key: string;
    };
    livekit: {
        apiKey: string;
        secretKey: string;
        websocketUrl: string;
    };
    alarm: {
        prewarmLeadSeconds: string;
        retryMinutes: string;
        maxDailyRetryCalls: string;
        callAgentCheckTimeoutMs: string;
    };
};
export default _default;
