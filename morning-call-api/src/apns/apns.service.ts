import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import apn from 'apn';
import fs from 'fs';

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
    note.aps = { 'content-available': 1 };
    note.payload = {
      caller: payload.caller,
      lkUrl: this.livekitUrl,
      lkToken: payload.livekitToken,
      alarmId: payload.alarmId,
    };

    const res = await this.provider.send(note, token);
    console.log(res.sent.length ? '✅ sent' : '❌ failed', res);
    return res;
  }

  async sendWakeFollowupPush(token: string, body: string) {
    const note = new apn.Notification();
    note.topic = this.cs.get<string>('apns.bundleId');
    note.alert = {
      title: 'Haru',
      body,
    };
    note.sound = 'default';
    note.payload = {
      type: 'wake_followup',
    };

    const res = await this.provider.send(note, token);
    console.log(res.sent.length ? '✅ followup sent' : '❌ followup failed', res);
    return res;
  }

  onModuleDestroy() {
    this.provider.shutdown();
  }
}
