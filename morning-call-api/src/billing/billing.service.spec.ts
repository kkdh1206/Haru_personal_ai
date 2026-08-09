import { BillingService } from './billing.service';

describe('BillingService', () => {
  function makeService(options: { enforcement?: boolean } = {}) {
    const userModel = {
      findById: jest.fn(),
      findOneAndUpdate: jest.fn(),
      updateOne: jest.fn(),
      findOne: jest.fn(),
    };
    const eventModel = { create: jest.fn().mockResolvedValue({}) };
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'billing.enforcementEnabled') {
          return options.enforcement ?? true;
        }
        if (key === 'billing.entitlementId') return 'haru_plus';
        if (key === 'billing.appleProductId') {
          return 'haru.plus.monthly';
        }
        return '';
      }),
    };

    const service = new BillingService(
      userModel as any,
      eventModel as any,
      config as any,
    );
    return { service, userModel, eventModel };
  }

  it('allows calls while enforcement is disabled', async () => {
    const { service, userModel } = makeService({ enforcement: false });

    await expect(service.canUseMorningCall('user-id')).resolves.toBe(true);
    expect(userModel.findById).not.toHaveBeenCalled();
  });

  it('requires a non-expired entitlement when enforcement is enabled', async () => {
    const { service, userModel } = makeService();
    const select = jest.fn().mockReturnValue({ lean: jest.fn() });
    userModel.findById.mockReturnValue({ select });
    select()
      .lean.mockResolvedValueOnce({
        subscriptionStatus: 'trial',
        subscriptionExpiresAt: new Date(Date.now() + 60_000),
      })
      .mockResolvedValueOnce({
        subscriptionStatus: 'grace_period',
        subscriptionExpiresAt: new Date(Date.now() - 60_000),
      });

    await expect(service.canUseMorningCall('user-id')).resolves.toBe(true);
    await expect(service.canUseMorningCall('user-id')).resolves.toBe(false);
  });

  it('verifies and applies an Apple free trial to the authenticated account', async () => {
    const { service, userModel } = makeService();
    userModel.findOneAndUpdate.mockResolvedValue({ _id: 'user-id' });
    const expiresAt = Date.now() + 86_400_000;
    const expectedToken = (service as any).appAccountToken('firebase-uid');
    (service as any).appleVerifier = {
      verifyAndDecodeTransaction: jest.fn().mockResolvedValue({
        originalTransactionId: 'original-transaction-id',
        transactionId: 'transaction-id',
        appAccountToken: expectedToken,
        offerDiscountType: 'FREE_TRIAL',
        expiresDate: expiresAt,
        signedDate: Date.now(),
        productId: 'haru.plus.monthly',
      }),
    };

    await expect(
      service.syncAppleTransaction('firebase-uid', 'signed-jws'),
    ).resolves.toEqual(expect.objectContaining({ entitlementId: 'haru_plus' }));
    expect(userModel.findOneAndUpdate).toHaveBeenCalledWith(
      { firebaseUid: 'firebase-uid' },
      {
        $set: expect.objectContaining({
          subscriptionStatus: 'trial',
          subscriptionExpiresAt: new Date(expiresAt),
          subscriptionWillRenew: true,
          isSubscribed: true,
          subscriptionExternalId: 'original-transaction-id',
        }),
      },
      { new: true },
    );
  });
});
