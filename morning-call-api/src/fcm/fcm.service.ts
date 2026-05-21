import { Injectable } from '@nestjs/common';
import * as firebase from 'firebase-admin';

type FcmResult = {
  sent: string[];
  failed: { token: string; error: unknown }[];
};

@Injectable()
export class FcmService {
  async sendCallPush(
    token: string,
    payload: {
      caller: string;
      lkUrl: string;
      lkToken: string;
      alarmId: string;
    },
  ): Promise<FcmResult> {
    return this.sendDataMessage(token, {
      caller: payload.caller,
      lkUrl: payload.lkUrl,
      lkToken: payload.lkToken,
      alarmId: payload.alarmId,
    });
  }

  async sendWakeFollowupPush(
    token: string,
    body: string,
  ): Promise<FcmResult> {
    return this.sendDataMessage(token, {
      type: 'wake_followup',
      title: 'Haru',
      body,
    });
  }

  private async sendDataMessage(
    token: string,
    data: Record<string, string>,
  ): Promise<FcmResult> {
    try {
      const messageId = await firebase.messaging().send({
        token,
        data,
        android: {
          priority: 'high',
          ttl: 120_000,
        },
      });

      return { sent: [messageId], failed: [] };
    } catch (error) {
      console.error('❌ FCM push failed', error);
      return { sent: [], failed: [{ token, error }] };
    }
  }
}
