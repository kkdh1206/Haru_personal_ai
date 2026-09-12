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

  it('marks Apple events as pending the answered call instead of an empty day', async () => {
    userService.getCalendarProvider.mockResolvedValue('apple');
    await expect(createService().getMorningCallContext('user-1')).resolves.toEqual({
      provider: 'apple', status: 'pending_device', events: [],
    });
    expect(userService.getCalendarProvider).toHaveBeenCalledTimes(1);
    expect(apnsService.sendAppleCalendarQueryPush).not.toHaveBeenCalled();
  });

  it('keeps a disconnected calendar distinct from a confirmed empty day', async () => {
    userService.getCalendarProvider.mockResolvedValue(null);
    await expect(createService().getMorningCallContext('user-1')).resolves.toEqual({
      provider: null, status: 'not_connected', events: [],
    });
  });

  it.each([
    { items: [] },
    { items: [{
      id: 'event-1', summary: 'Meeting',
      start: { dateTime: '2026-09-12T09:00:00-04:00' },
      end: { dateTime: '2026-09-12T10:00:00-04:00' },
    }] },
  ])('keeps successful Google results, including empty days, in the user time zone (%j)', async ({ items }) => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-12T15:00:00Z'));
    try {
      userService.getCalendarProvider.mockResolvedValue('google');
      const list = jest.fn().mockResolvedValue({ data: { items } });
      const service = createService();
      jest.spyOn(service as any, 'getGoogleCalendarClient').mockResolvedValue({
        calendar: { events: { list } }, timeZone: 'America/Toronto',
      });
      const context = await service.getMorningCallContext('user-1');
      expect(context.status).toBe('ok');
      expect(context.provider).toBe('google');
      expect(context.events).toHaveLength(items.length);
      expect(list).toHaveBeenCalledWith(expect.objectContaining({
        timeMin: '2026-09-12T04:00:00.000Z',
        timeMax: '2026-09-13T03:59:59.999Z',
      }));
    } finally {
      jest.useRealTimers();
    }
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
