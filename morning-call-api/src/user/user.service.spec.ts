import { google } from 'googleapis';
import { UserService } from './user.service';

jest.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: jest.fn(),
    },
  },
}));

describe('UserService', () => {
  const findByIdAndUpdate = jest.fn();
  const encrypt = jest.fn((value: string) => `encrypted:${value}`);
  const getToken = jest.fn();

  function createService() {
    const model = { findByIdAndUpdate } as any;
    const crypto = { encrypt, decrypt: jest.fn() } as any;
    const config = { get: jest.fn((key: string) => `config:${key}`) } as any;
    return new UserService(
      model,
      {} as any,
      {} as any,
      {} as any,
      crypto,
      config,
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
    findByIdAndUpdate.mockReturnValue({ lean: jest.fn().mockResolvedValue({}) });
    (google.auth.OAuth2 as unknown as jest.Mock).mockImplementation(() => ({
      getToken,
    }));
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
    );

    expect(findByIdAndUpdate).toHaveBeenCalledWith(
      { _id: 'user-1' },
      {
        $set: {
          deviceToken: 'voip-token',
          deviceType: 'ios',
          notificationToken: 'notification-token',
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
});
