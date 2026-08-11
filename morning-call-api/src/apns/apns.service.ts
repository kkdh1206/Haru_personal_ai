import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import apn from 'apn';
import fs from 'fs';

type ApnNotificationWithHeaders = apn.Notification & {
  headers: () => Record<string, string | number>;
};

export type ApnsEnvironment = 'sandbox' | 'production';

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
  private readonly providers = new Map<ApnsEnvironment, apn.Provider>();
  private readonly providerToken: apn.ProviderToken;
  private readonly defaultEnvironment: ApnsEnvironment;
  private readonly livekitUrl: string;

  constructor(private readonly cs: ConfigService) {
    this.livekitUrl = this.cs.getOrThrow<string>('livekit.websocketUrl');
    this.providerToken = {
      key: fs.readFileSync('APNsKey.p8'),
      keyId: this.cs.getOrThrow<string>('apns.keyId'),
      teamId: this.cs.getOrThrow<string>('apns.teamId'),
    };
    this.defaultEnvironment = this.cs.get<boolean>('apns.production')
      ? 'production'
      : 'sandbox';
  }

  private getProvider(environment?: ApnsEnvironment) {
    const selectedEnvironment = this.resolveEnvironment(environment);
    const existingProvider = this.providers.get(selectedEnvironment);
    if (existingProvider) return existingProvider;

    const provider = new apn.Provider({
      token: this.providerToken,
      production: selectedEnvironment === 'production',
    });
    this.providers.set(selectedEnvironment, provider);
    return provider;
  }

  private resolveEnvironment(environment?: ApnsEnvironment) {
    return environment ?? this.defaultEnvironment;
  }

  private applyPushHeaders(
    note: apn.Notification,
    pushType: 'alert' | 'background' | 'voip',
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
    environment?: ApnsEnvironment,
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

    const selectedEnvironment = this.resolveEnvironment(environment);
    const res = await this.getProvider(selectedEnvironment).send(note, token);
    console.log(res.sent.length ? '✅ sent' : '❌ failed', {
      environment: selectedEnvironment,
      ...summarizeApnsResult(res),
    });
    return res;
  }

  async sendWakeFollowupPush(
    token: string,
    body: string,
    environment?: ApnsEnvironment,
  ) {
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

    const selectedEnvironment = this.resolveEnvironment(environment);
    const res = await this.getProvider(selectedEnvironment).send(note, token);
    console.log(res.sent.length ? '✅ followup sent' : '❌ followup failed', {
      environment: selectedEnvironment,
      ...summarizeApnsResult(res),
    });
    return res;
  }

  async sendAppleCalendarSyncPush(
    token: string,
    environment?: ApnsEnvironment,
  ) {
    const note = new apn.Notification();
    note.topic = this.cs.getOrThrow<string>('apns.bundleId');
    note.priority = 5;
    note.expiry = Math.floor(Date.now() / 1000) + 3600;
    note.aps = { 'content-available': 1 };
    note.payload = { type: 'apple_calendar_pending' };
    this.applyPushHeaders(note, 'background');

    const selectedEnvironment = this.resolveEnvironment(environment);
    const res = await this.getProvider(selectedEnvironment).send(note, token);
    console.log(res.sent.length ? '✅ calendar sync sent' : '❌ calendar sync failed', {
      environment: selectedEnvironment,
      ...summarizeApnsResult(res),
    });
    return res;
  }

  onModuleDestroy() {
    this.providers.forEach((provider) => provider.shutdown());
    this.providers.clear();
  }
}
