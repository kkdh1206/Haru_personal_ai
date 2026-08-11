import { google } from 'googleapis';
import * as firebase from 'firebase-admin';
import { UserService } from './user.service';

jest.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: jest.fn(),
    },
  },
}));
jest.mock('firebase-admin', () => ({
  auth: jest.fn(),
}));

describe('UserService', () => {
  const findByIdAndUpdate = jest.fn();
  const findById = jest.fn();
  const findByIdAndDelete = jest.fn();
  const findOne = jest.fn();
  const create = jest.fn();
  const updateOne = jest.fn();
  const findOneAndUpdate = jest.fn();
  const deleteAlarms = jest.fn();
  const deleteMemories = jest.fn();
  const deleteProfile = jest.fn();
  const deleteFirebaseUser = jest.fn();
  const getFirebaseUser = jest.fn();
  const encrypt = jest.fn((value: string) => `encrypted:${value}`);
  const getToken = jest.fn();

  function createService() {
    const model = {
      findByIdAndUpdate,
      findById,
      findByIdAndDelete,
      findOne,
      create,
      updateOne,
      findOneAndUpdate,
    } as any;
    const crypto = { encrypt, decrypt: jest.fn() } as any;
    const config = { get: jest.fn((key: string) => `config:${key}`) } as any;
    return new UserService(
      model,
      { deleteMany: deleteAlarms } as any,
      { deleteMany: deleteMemories } as any,
      { deleteOne: deleteProfile } as any,
      crypto,
      config,
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
    (firebase.auth as unknown as jest.Mock).mockReturnValue({
      deleteUser: deleteFirebaseUser,
      getUser: getFirebaseUser,
    });
    findByIdAndUpdate.mockReturnValue({
      lean: jest.fn().mockResolvedValue({}),
    });
    findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({ _id: 'user-1' }),
    });
    updateOne.mockResolvedValue({});
    findOneAndUpdate.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ dailyCallCount: 1 }),
      }),
    });
    (google.auth.OAuth2 as unknown as jest.Mock).mockImplementation(() => ({
      getToken,
    }));
    deleteFirebaseUser.mockResolvedValue(undefined);
    getFirebaseUser.mockResolvedValue({ uid: 'firebase-1' });
    deleteAlarms.mockResolvedValue({ deletedCount: 2 });
    deleteMemories.mockResolvedValue({ deletedCount: 3 });
    deleteProfile.mockResolvedValue({ deletedCount: 1 });
  });

  it('stores Android device type with the device token', async () => {
    await createService().updateDeviceToken('user-1', 'token-1', 'android');

    expect(findByIdAndUpdate).toHaveBeenCalledWith(
      { _id: 'user-1' },
      { $set: { deviceToken: 'token-1', deviceType: 'android' } },
      { new: true },
    );
  });

  it('defaults missing device type to iOS', async () => {
    await createService().updateDeviceToken('user-1', 'token-1');

    expect(findByIdAndUpdate).toHaveBeenCalledWith(
      { _id: 'user-1' },
      { $set: { deviceToken: 'token-1', deviceType: 'ios' } },
      { new: true },
    );
  });

  it('stores a separate iOS notification token', async () => {
    await createService().updateDeviceToken(
      'user-1',
      'voip-token',
      'ios',
      'notification-token',
      'sandbox',
    );

    expect(findByIdAndUpdate).toHaveBeenCalledWith(
      { _id: 'user-1' },
      {
        $set: {
          deviceToken: 'voip-token',
          deviceType: 'ios',
          notificationToken: 'notification-token',
          apnsEnvironment: 'sandbox',
        },
      },
      { new: true },
    );
  });

  it('stores the configurable speech style with the call language', async () => {
    await createService().update('user-1', {
      name: 'Mina',
      language: '日本語',
      speechStyle: 'ja-osaka',
    });

    expect(findByIdAndUpdate).toHaveBeenCalledWith(
      { _id: 'user-1' },
      {
        $set: {
          name: 'Mina',
          language: '日本語',
          speechStyle: 'ja-osaka',
        },
      },
      { new: true },
    );
  });

  it('exchanges Android calendar auth code and stores encrypted tokens', async () => {
    getToken.mockResolvedValue({
      tokens: {
        access_token: 'access-token',
        refresh_token: 'refresh-token',
      },
    });

    await expect(
      createService().updateCalendarTokenFromAuthCode('user-1', 'auth-code'),
    ).resolves.toEqual({ connected: true });

    expect(getToken).toHaveBeenCalledWith('auth-code');
    expect(findByIdAndUpdate).toHaveBeenCalledWith(
      { _id: 'user-1' },
      {
        $set: {
          calendarAccessToken: 'encrypted:access-token',
          calendarRefreshToken: 'encrypted:refresh-token',
          calendarProvider: 'google',
        },
      },
      { new: true },
    );
  });

  it('rejects calendar auth codes that do not return a refresh token', async () => {
    getToken.mockResolvedValue({ tokens: { access_token: 'access-token' } });

    await expect(
      createService().updateCalendarTokenFromAuthCode('user-1', 'bad-code'),
    ).rejects.toThrow('Google Calendar auth code did not return tokens.');
  });

  it('resets the local-day counter and atomically reserves a call slot', async () => {
    await expect(
      createService().reserveDailyCallSlot('user-1', '2026-07-24', 3),
    ).resolves.toEqual({ allowed: true, count: 1, limit: 3 });

    expect(updateOne).toHaveBeenCalledWith(
      {
        _id: 'user-1',
        dailyCallTrackingDate: { $ne: '2026-07-24' },
      },
      {
        $set: {
          dailyCallTrackingDate: '2026-07-24',
          dailyCallCount: 0,
        },
      },
    );
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: 'user-1',
        dailyCallTrackingDate: '2026-07-24',
        dailyCallCount: { $lt: 3 },
      },
      { $inc: { dailyCallCount: 1 } },
      { new: true },
    );
  });

  it('rejects a call slot after the daily limit is reached', async () => {
    findOneAndUpdate.mockReturnValueOnce({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      }),
    });

    await expect(
      createService().reserveDailyCallSlot('user-1', '2026-07-24', 3),
    ).resolves.toEqual({ allowed: false, count: 3, limit: 3 });
  });

  it('releases a reserved slot when the call push fails', async () => {
    await createService().releaseDailyCallSlot('user-1', '2026-07-24');

    expect(updateOne).toHaveBeenCalledWith(
      {
        _id: 'user-1',
        dailyCallTrackingDate: '2026-07-24',
        dailyCallCount: { $gt: 0 },
      },
      { $inc: { dailyCallCount: -1 } },
    );
  });

  it('deletes Firebase auth and all user-owned data', async () => {
    findById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: 'user-1',
          firebaseUid: 'firebase-1',
        }),
      }),
    });
    findByIdAndDelete.mockReturnValue({
      lean: jest.fn().mockResolvedValue({ _id: 'user-1' }),
    });

    await expect(createService().deleteAccount('user-1')).resolves.toEqual({
      status: 'deleted',
      deleted: true,
      firebaseDeleted: true,
      deletedResources: {
        alarms: 2,
        memories: 3,
        profile: 1,
        appleCalendarEvents: 0,
        pendingAppleCalendarEvents: 0,
      },
    });

    expect(deleteFirebaseUser).toHaveBeenCalledWith('firebase-1');
    expect(deleteAlarms).toHaveBeenCalledWith({ userId: 'user-1' });
    expect(deleteMemories).toHaveBeenCalledWith({ userId: 'user-1' });
    expect(deleteProfile).toHaveBeenCalledWith({ userId: 'user-1' });
    expect(findByIdAndDelete).toHaveBeenCalledWith('user-1');
  });

  it('does not recreate a database user after Firebase deletion', async () => {
    findOne.mockReturnValueOnce({
      lean: jest.fn().mockResolvedValue(null),
    });
    getFirebaseUser.mockRejectedValueOnce({
      code: 'auth/user-not-found',
    });

    await expect(
      createService().oauthSync('firebase-1', 'deleted@example.com'),
    ).rejects.toEqual({ code: 'auth/user-not-found' });

    expect(create).not.toHaveBeenCalled();
  });
});
