import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import apn from 'apn';
import fs from 'fs';

type ApnNotificationWithHeaders = apn.Notification & {
  headers: () => Record<string, string | number>;
};

function summarizeApnsResult(res: apn.Responses) {
  return {
    sent: res.sent,
    failed: res.failed.map((failure) => ({
      device: failure.device,
      status: failure.status,
      reason: failure.response?.reason,
      timestamp: failure.response?.timestamp,
      error: failure.error?.message,
    })),
  };
}

@Injectable()
export class ApnsService implements OnModuleDestroy {
  private provider: apn.Provider;
  private livekitUrl: string;

  constructor(private readonly cs: ConfigService) {
    this.livekitUrl = this.cs.getOrThrow<string>('livekit.websocketUrl');
    this.provider = new apn.Provider({
      token: {
        key: fs.readFileSync('APNsKey.p8'),
        keyId: this.cs.getOrThrow<string>('apns.keyId'),
        teamId: this.cs.getOrThrow<string>('apns.teamId'),
      },
      production: this.cs.get<boolean>('apns.production'),
    });
  }

  private applyPushHeaders(
    note: apn.Notification,
    pushType: 'alert' | 'voip',
    expiration?: number,
  ) {
    const notification = note as ApnNotificationWithHeaders;
    const originalHeaders = notification.headers.bind(notification);
    notification.headers = () => {
      const headers: Record<string, string | number> = {
        ...originalHeaders(),
        'apns-push-type': pushType,
      };
      if (expiration !== undefined) {
        headers['apns-expiration'] = expiration;
      }
      return headers;
    };
  }

  async sendVoipPush(
    token: string,
    payload: {
      caller: string;
      livekitToken: string;
      alarmId: string;
    },
  ) {
    const note = new apn.Notification();
    note.topic = `${this.cs.get<string>('apns.bundleId')}.voip`;
    note.priority = 10;
    note.aps = { 'content-available': 1 };
    note.payload = {
      caller: payload.caller,
      lkUrl: this.livekitUrl,
      lkToken: payload.livekitToken,
      alarmId: payload.alarmId,
    };
    this.applyPushHeaders(note, 'voip', 0);

    const res = await this.provider.send(note, token);
    console.log(
      res.sent.length ? '✅ sent' : '❌ failed',
      summarizeApnsResult(res),
    );
    return res;
  }

  async sendWakeFollowupPush(token: string, body: string) {
    const note = new apn.Notification();
    note.topic = this.cs.getOrThrow<string>('apns.bundleId');
    note.priority = 10;
    note.expiry = Math.floor(Date.now() / 1000) + 120;
    note.alert = {
      title: 'Haru',
      body,
    };
    note.sound = 'default';
    note.payload = { type: 'wake_followup' };
    this.applyPushHeaders(note, 'alert');

    const res = await this.provider.send(note, token);
    console.log(
      res.sent.length ? '✅ followup sent' : '❌ followup failed',
      summarizeApnsResult(res),
    );
    return res;
  }

  onModuleDestroy() {
    this.provider.shutdown();
  }
}
