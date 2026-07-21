"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = () => ({
    mongo: {
        uri: process.env.MONGO_URI || 'mongodb://localhost:27017',
        dbName: process.env.MONGO_DB_NAME || 'morning-call',
    },
    agora: {
        appId: process.env.AGORA_APP_ID || '',
        cert: process.env.AGORA_APP_CERT || '',
    },
    agent: {
        url: process.env.AGENT_URL || 'http://localhost:8080',
    },
    apns: {
        keyId: process.env.APNS_KEY_ID || '',
        teamId: process.env.APNS_TEAM_ID || '',
        bundleId: process.env.APNS_BUNDLE_ID || '',
        production: process.env.APNS_PROD == 'true',
    },
    google: {
        clientId: process.env.GOOGLE_CLIENT_ID || '',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    },
    weather: {
        apiKey: process.env.OWM_API_KEY || '',
    },
    encryption: {
        key: process.env.ENCRYPTION_KEY || '',
    },
    livekit: {
        apiKey: process.env.LIVEKIT_API_KEY || '',
        secretKey: process.env.LIVEKIT_SECRET_KEY || '',
        websocketUrl: process.env.LIVEKIT_WEBSOCKET_URL || '',
    },
    alarm: {
        prewarmLeadSeconds: process.env.ALARM_CALL_LEAD_SECONDS || '20',
        retryMinutes: process.env.ALARM_RETRY_MINUTES || '2',
        maxDailyRetryCalls: process.env.ALARM_MAX_DAILY_RETRY_CALLS || '1',
        callAgentCheckTimeoutMs: process.env.ALARM_CALL_AGENT_CHECK_TIMEOUT_MS || '1000',
    },
});
//# sourceMappingURL=configuration.js.map