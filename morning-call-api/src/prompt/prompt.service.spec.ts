import { CalendarService } from '../calendar/calendar.service';
import { PromptService } from './prompt.service';

describe('PromptService calendar routing', () => {
  const getCalendarProvider = jest.fn();
  const getUserCalendarToken = jest.fn();
  const sendAppleCalendarQueryPush = jest.fn();
  const user = {
    _id: 'user-1',
    name: '사용자',
    timeZone: 'America/Toronto',
    // Legacy state: Settings resolves this to Apple when Google tokens are gone.
    calendarProvider: 'google',
    appleCalendarConnected: true,
  };
  const alarmService = {
    getAlarmWithUser: jest.fn(),
    getMaxDailyRetryCalls: () => 3,
  };

  function createService() {
    const calendar = new CalendarService(
      { getCalendarProvider, getUserCalendarToken } as any,
      { get: jest.fn() } as any,
      { sendAppleCalendarQueryPush } as any,
    );
    return new PromptService(
      alarmService as any,
      calendar,
      { getCurrentWeather: jest.fn().mockResolvedValue(null) } as any,
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
    alarmService.getAlarmWithUser.mockResolvedValue({ user, dailyRetryCount: 0 });
  });

  it('queries Apple on the connected device when Settings resolves the provider to Apple', async () => {
    getCalendarProvider.mockResolvedValue('apple');

    const prompt = await createService().getPrompt('alarm-1');

    expect(prompt).toContain('[APPLE_CALENDAR_ON_CALL]');
    expect(getCalendarProvider).toHaveBeenCalledTimes(1);
    expect(getUserCalendarToken).not.toHaveBeenCalled();
    expect(sendAppleCalendarQueryPush).not.toHaveBeenCalled();
  });

  it('does not query Apple merely because an old Apple connection flag remains', async () => {
    alarmService.getAlarmWithUser.mockResolvedValue({
      user: { ...user, calendarProvider: null },
    });
    getCalendarProvider.mockResolvedValue('google');
    getUserCalendarToken.mockRejectedValue(new Error('unauthorized_client'));
    const errorLog = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const prompt = await createService().getPrompt('alarm-1');
      expect(prompt).not.toContain('[APPLE_CALENDAR_ON_CALL]');
      expect(prompt).toContain('조회 실패');
      expect(getCalendarProvider).toHaveBeenCalledTimes(1);
    } finally {
      errorLog.mockRestore();
    }
  });
});
