import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import {
  AutoRenewStatus,
  Environment,
  JWSRenewalInfoDecodedPayload,
  JWSTransactionDecodedPayload,
  OfferDiscountType,
  SignedDataVerifier,
  Status,
} from '@apple/app-store-server-library';
import { createHash } from 'crypto';
import { google } from 'googleapis';
import { Model } from 'mongoose';
import { User, UserDocument } from 'src/user/schemas/user.schema';
import {
  BillingEvent,
  BillingEventDocument,
} from './schemas/billing-event.schema';

type SubscriptionStatus =
  'none' | 'trial' | 'active' | 'grace_period' | 'expired';

@Injectable()
export class BillingService {
  private appleVerifier?: SignedDataVerifier;

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(BillingEvent.name)
    private readonly eventModel: Model<BillingEventDocument>,
    private readonly config: ConfigService,
  ) {}

  isEnforcementEnabled() {
    return Boolean(this.config.get<boolean>('billing.enforcementEnabled'));
  }

  private hasActiveStatus(user: Partial<User> | null | undefined) {
    if (!user) return false;
    if (
      !['trial', 'active', 'grace_period'].includes(user.subscriptionStatus)
    ) {
      return false;
    }
    if (!user.subscriptionExpiresAt) return false;
    return new Date(user.subscriptionExpiresAt).getTime() > Date.now();
  }

  async canUseMorningCall(userId: string) {
    if (!this.isEnforcementEnabled()) return true;
    const user = await this.userModel
      .findById(userId)
      .select('subscriptionStatus subscriptionExpiresAt')
      .lean();
    return this.hasActiveStatus(user);
  }

  getEntitlement(user: Partial<User>) {
    return {
      entitlementId:
        this.config.get<string>('billing.entitlementId') || 'haru_plus',
      status: user.subscriptionStatus || 'none',
      productId: user.subscriptionProductId || null,
      store: user.subscriptionStore || null,
      expiresAt: user.subscriptionExpiresAt || null,
      willRenew: Boolean(user.subscriptionWillRenew),
      isActive: this.hasActiveStatus(user),
      enforcementEnabled: this.isEnforcementEnabled(),
    };
  }

  async getEntitlementByUserId(userId: string) {
    const user = await this.userModel.findById(userId).lean();
    return this.getEntitlement(user || {});
  }

  private appAccountToken(firebaseUid: string) {
    const hash = createHash('sha256').update(firebaseUid).digest('hex');
    return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(
      12,
      16,
    )}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
  }

  private googleAccountId(firebaseUid: string) {
    return createHash('sha256').update(firebaseUid).digest('hex');
  }

  private getAppleVerifier() {
    if (this.appleVerifier) return this.appleVerifier;
    const roots = (this.config.get<string>('billing.appleRootCaBase64') || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => Buffer.from(value, 'base64'));
    if (!roots.length) {
      throw new ServiceUnavailableException(
        'Apple transaction verification is not configured',
      );
    }

    const environmentName =
      this.config.get<string>('billing.appleEnvironment') || 'Sandbox';
    const environment = Object.values(Environment).includes(
      environmentName as Environment,
    )
      ? (environmentName as Environment)
      : Environment.SANDBOX;
    const appIdValue = this.config.get<string>('billing.appleAppId');
    const appAppleId = appIdValue ? Number(appIdValue) : undefined;
    this.appleVerifier = new SignedDataVerifier(
      roots,
      this.config.get<boolean>('billing.appleOnlineChecks') !== false,
      environment,
      this.config.get<string>('billing.appleBundleId') ||
        'com.poapper.morningcall',
      Number.isFinite(appAppleId) ? appAppleId : undefined,
    );
    return this.appleVerifier;
  }

  private appleStatus(
    transaction: JWSTransactionDecodedPayload,
    renewal?: JWSRenewalInfoDecodedPayload,
    notificationStatus?: number,
  ): { status: SubscriptionStatus; expiresAt: Date | null; active: boolean } {
    const graceExpiry = renewal?.gracePeriodExpiresDate;
    const expiresMs = graceExpiry || transaction.expiresDate || 0;
    const expiresAt = expiresMs ? new Date(expiresMs) : null;
    const revoked = Boolean(transaction.revocationDate);
    const inGrace =
      notificationStatus === Status.BILLING_GRACE_PERIOD &&
      Boolean(graceExpiry && graceExpiry > Date.now());
    const active = !revoked && Boolean(expiresMs > Date.now());
    if (inGrace) return { status: 'grace_period', expiresAt, active: true };
    if (!active) return { status: 'expired', expiresAt, active: false };
    const trial =
      transaction.offerDiscountType === OfferDiscountType.FREE_TRIAL ||
      renewal?.offerDiscountType === OfferDiscountType.FREE_TRIAL;
    return { status: trial ? 'trial' : 'active', expiresAt, active: true };
  }

  private async applyAppleTransaction(
    query: Record<string, any>,
    transaction: JWSTransactionDecodedPayload,
    renewal?: JWSRenewalInfoDecodedPayload,
    notificationStatus?: number,
  ) {
    const expectedProduct =
      this.config.get<string>('billing.appleProductId') ||
      'haru.plus.monthly';
    if (transaction.productId !== expectedProduct) {
      throw new BadRequestException('Unexpected Apple product');
    }
    if (!transaction.originalTransactionId) {
      throw new BadRequestException('Apple transaction has no original ID');
    }
    const resolved = this.appleStatus(transaction, renewal, notificationStatus);
    const willRenew = renewal
      ? renewal.autoRenewStatus === AutoRenewStatus.ON
      : resolved.active;
    const user = await this.userModel.findOneAndUpdate(
      query,
      {
        $set: {
          isSubscribed: resolved.active,
          subscriptionStatus: resolved.status,
          subscriptionProductId: transaction.productId,
          subscriptionStore: 'APP_STORE',
          subscriptionExpiresAt: resolved.expiresAt,
          subscriptionWillRenew: willRenew,
          subscriptionLastEventAt: new Date(
            transaction.signedDate || Date.now(),
          ),
          subscriptionExternalId: transaction.originalTransactionId,
          appleAppAccountToken: transaction.appAccountToken || null,
        },
      },
      { new: true },
    );
    return user;
  }

  async syncAppleTransaction(
    firebaseUid: string,
    signedTransactionInfo: string | null,
  ) {
    if (!signedTransactionInfo) {
      await this.userModel.updateOne(
        { firebaseUid, subscriptionStore: 'APP_STORE' },
        {
          $set: {
            isSubscribed: false,
            subscriptionStatus: 'expired',
            subscriptionExpiresAt: null,
            subscriptionWillRenew: false,
            subscriptionLastEventAt: new Date(),
          },
        },
      );
      const emptyUser = await this.userModel.findOne({ firebaseUid }).lean();
      return this.getEntitlement(emptyUser || {});
    }

    const transaction =
      await this.getAppleVerifier().verifyAndDecodeTransaction(
        signedTransactionInfo,
      );
    const expectedToken = this.appAccountToken(firebaseUid).toLowerCase();
    if ((transaction.appAccountToken || '').toLowerCase() !== expectedToken) {
      throw new UnauthorizedException('Apple transaction account mismatch');
    }
    const user = await this.applyAppleTransaction({ firebaseUid }, transaction);
    if (!user) throw new BadRequestException('User not found');
    return this.getEntitlement(user);
  }

  async processAppleNotification(signedPayload: string) {
    if (!signedPayload) throw new BadRequestException('Missing signedPayload');
    const notification =
      await this.getAppleVerifier().verifyAndDecodeNotification(signedPayload);
    const eventId = notification.notificationUUID || '';
    if (!eventId) throw new BadRequestException('Missing notification UUID');
    try {
      await this.eventModel.create({
        eventId,
        eventType: String(notification.notificationType || 'UNKNOWN'),
        appUserId: null,
        payload: { signedPayload },
      });
    } catch (error) {
      if ((error as any)?.code === 11000) {
        return { processed: false, duplicate: true };
      }
      throw error;
    }

    const signedTransaction = notification.data?.signedTransactionInfo;
    if (!signedTransaction) return { processed: true, userUpdated: false };
    const transaction =
      await this.getAppleVerifier().verifyAndDecodeTransaction(
        signedTransaction,
      );
    const renewal = notification.data?.signedRenewalInfo
      ? await this.getAppleVerifier().verifyAndDecodeRenewalInfo(
          notification.data.signedRenewalInfo,
        )
      : undefined;
    const user = await this.applyAppleTransaction(
      { subscriptionExternalId: transaction.originalTransactionId },
      transaction,
      renewal,
      notification.data?.status,
    );
    return { processed: true, userUpdated: Boolean(user) };
  }

  private googlePublisher() {
    const raw = this.config.get<string>('billing.googleServiceAccountJson');
    if (!raw) {
      throw new ServiceUnavailableException(
        'Google Play verification is not configured',
      );
    }
    let credentials: Record<string, any>;
    try {
      credentials = JSON.parse(raw);
    } catch {
      throw new ServiceUnavailableException(
        'Google Play service account JSON is invalid',
      );
    }
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/androidpublisher'],
    });
    return google.androidpublisher({ version: 'v3', auth });
  }

  private async fetchGooglePurchase(purchaseToken: string) {
    if (!purchaseToken) throw new BadRequestException('Missing purchase token');
    const packageName =
      this.config.get<string>('billing.googlePackageName') ||
      'com.poapper.morningcall';
    const publisher = this.googlePublisher();
    const response = await publisher.purchases.subscriptionsv2.get({
      packageName,
      token: purchaseToken,
    });
    return { publisher, packageName, purchase: response.data };
  }

  private async applyGooglePurchase(
    query: Record<string, any>,
    purchaseToken: string,
    claimedProductId?: string,
  ) {
    const { publisher, packageName, purchase } =
      await this.fetchGooglePurchase(purchaseToken);
    const expectedProduct =
      this.config.get<string>('billing.googleProductId') || 'haru_plus_monthly';
    const lineItem = purchase.lineItems?.find(
      (item) => item.productId === expectedProduct,
    );
    if (
      !lineItem ||
      (claimedProductId && claimedProductId !== expectedProduct)
    ) {
      throw new BadRequestException('Unexpected Google Play product');
    }
    const expiresAt = lineItem.expiryTime
      ? new Date(lineItem.expiryTime)
      : null;
    const state = purchase.subscriptionState || '';
    const inGrace = state === 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD';
    const activeStates = new Set([
      'SUBSCRIPTION_STATE_ACTIVE',
      'SUBSCRIPTION_STATE_CANCELED',
      'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
    ]);
    const active =
      activeStates.has(state) &&
      Boolean(expiresAt && expiresAt.getTime() > Date.now());
    const isTrial = Boolean(
      lineItem.offerDetails?.offerTags?.includes('free-trial'),
    );
    const status: SubscriptionStatus = !active
      ? 'expired'
      : inGrace
        ? 'grace_period'
        : isTrial
          ? 'trial'
          : 'active';
    const user = await this.userModel.findOneAndUpdate(
      query,
      {
        $set: {
          isSubscribed: active,
          subscriptionStatus: status,
          subscriptionProductId: expectedProduct,
          subscriptionStore: 'PLAY_STORE',
          subscriptionExpiresAt: expiresAt,
          subscriptionWillRenew: Boolean(
            lineItem.autoRenewingPlan?.autoRenewEnabled,
          ),
          subscriptionLastEventAt: new Date(),
          subscriptionExternalId: purchaseToken,
        },
      },
      { new: true },
    );
    if (
      active &&
      purchase.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING'
    ) {
      await publisher.purchases.subscriptions.acknowledge({
        packageName,
        subscriptionId: expectedProduct,
        token: purchaseToken,
        requestBody: {},
      });
    }
    return user;
  }

  async syncGooglePurchase(
    firebaseUid: string,
    purchaseToken: string,
    productId: string,
  ) {
    const { purchase } = await this.fetchGooglePurchase(purchaseToken);
    const expectedAccount = this.googleAccountId(firebaseUid);
    if (
      purchase.externalAccountIdentifiers?.obfuscatedExternalAccountId !==
      expectedAccount
    ) {
      throw new UnauthorizedException('Google Play purchase account mismatch');
    }
    const user = await this.applyGooglePurchase(
      { firebaseUid },
      purchaseToken,
      productId,
    );
    if (!user) throw new BadRequestException('User not found');
    return this.getEntitlement(user);
  }

  async processGoogleNotification(
    authorization: string,
    body: Record<string, any>,
  ) {
    const audience = this.config.get<string>(
      'billing.googleNotificationAudience',
    );
    const token = authorization.replace(/^Bearer\s+/i, '');
    if (!audience || !token) {
      throw new UnauthorizedException('Missing Google notification identity');
    }
    await new google.auth.OAuth2().verifyIdToken({ idToken: token, audience });
    const encoded = body?.message?.data;
    if (!encoded) throw new BadRequestException('Missing Pub/Sub message');
    const message = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
    const purchaseToken = message?.subscriptionNotification?.purchaseToken;
    if (!purchaseToken) return { processed: true, userUpdated: false };
    const eventId = String(body?.message?.messageId || '');
    if (eventId) {
      try {
        await this.eventModel.create({
          eventId,
          eventType: 'GOOGLE_PLAY_RTDN',
          appUserId: null,
          payload: message,
        });
      } catch (error) {
        if ((error as any)?.code === 11000) {
          return { processed: false, duplicate: true };
        }
        throw error;
      }
    }
    const user = await this.applyGooglePurchase(
      { subscriptionExternalId: purchaseToken },
      purchaseToken,
    );
    return { processed: true, userUpdated: Boolean(user) };
  }
}
