import { CalendarService } from './calendar.service';

describe('CalendarService Apple Calendar integration', () => {
  const userService = {
    getCalendarProvider: jest.fn(),
    getCalendarStatus: jest.fn(),
    findOne: jest.fn(),
    connectAppleCalendar: jest.fn(),
    disconnectAppleCalendar: jest.fn(),
    getUserDeviceToken: jest.fn(),
  };
  const configService = { get: jest.fn() };
  const apnsService = {
    sendAppleCalendarCreateEventPush: jest.fn(),
    sendAppleCalendarQueryPush: jest.fn(),
  };

  function createService() {
    return new CalendarService(
      userService as any,
      configService as any,
      apnsService as any,
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
    userService.findOne.mockResolvedValue({ timeZone: 'Asia/Seoul' });
  });

  it('requests only the current morning-call events and keeps them in memory', async () => {
    userService.getCalendarProvider.mockResolvedValue('apple');
    userService.getUserDeviceToken.mockResolvedValue({
      deviceType: 'ios',
      notificationToken: 'notification-token',
      apnsEnvironment: 'sandbox',
    });
    const service = createService();
    apnsService.sendAppleCalendarQueryPush.mockImplementation(
      async (_token, payload) => {
        service.receiveMorningCallAppleCalendar('user-1', {
          requestId: payload.requestId,
          events: [
            {
              externalId: 'event-1',
              title: '회의',
              startTime: '2026-08-03T09:00:00Z',
              endTime: '2026-08-03T10:00:00Z',
              location: '회의실',
            },
          ],
        });
        return { sent: [{}], failed: [] };
      },
    );

    await expect(
      service.getTodayEvents('user-1', { requestAppleCalendar: true }),
    ).resolves.toEqual([
      {
        id: 'event-1',
        summary: '회의',
        description: null,
        start: '2026-08-03T09:00:00Z',
        end: '2026-08-03T10:00:00Z',
        location: '회의실',
      },
    ]);
    expect(apnsService.sendAppleCalendarQueryPush).toHaveBeenCalledWith(
      'notification-token',
      expect.objectContaining({
        requestId: expect.any(String),
        rangeStart: expect.any(String),
        rangeEnd: expect.any(String),
      }),
      'sandbox',
    );
  });

  it('does not query or store Apple events outside a morning call', async () => {
    userService.getCalendarProvider.mockResolvedValue('apple');

    await expect(createService().getTodayEvents('user-1')).resolves.toEqual([]);
    await expect(
      createService().getSchedule('user-1', '2026-08-03'),
    ).resolves.toEqual([]);
    expect(apnsService.sendAppleCalendarQueryPush).not.toHaveBeenCalled();
  });

  it('delivers spoken event additions directly to the iPhone without storing them', async () => {
    userService.getCalendarProvider.mockResolvedValue('apple');
    userService.getUserDeviceToken.mockResolvedValue({
      deviceType: 'ios',
      notificationToken: 'notification-token',
      apnsEnvironment: 'sandbox',
    });
    apnsService.sendAppleCalendarCreateEventPush.mockResolvedValue({
      sent: [{}],
      failed: [],
    });

    await expect(
      createService().createEvent('user-1', {
        userId: 'user-1',
        title: '치과',
        startTime: '2026-08-03T14:00:00+09:00',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        success: true,
        pending: true,
        eventId: expect.any(String),
      }),
    );
    expect(apnsService.sendAppleCalendarCreateEventPush).toHaveBeenCalledWith(
      'notification-token',
      expect.objectContaining({
        eventId: expect.any(String),
        title: '치과',
        endTime: expect.any(String),
      }),
      'sandbox',
    );
  });
});
