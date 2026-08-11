import { CalendarService } from './calendar.service';

describe('CalendarService Apple Calendar integration', () => {
  const userService = {
    getCalendarProvider: jest.fn(),
    getCalendarStatus: jest.fn(),
    findOne: jest.fn(),
    markAppleCalendarSynced: jest.fn(),
    connectAppleCalendar: jest.fn(),
    disconnectAppleCalendar: jest.fn(),
    getUserDeviceToken: jest.fn(),
  };
  const configService = { get: jest.fn() };
  const apnsService = { sendAppleCalendarSyncPush: jest.fn() };
  const appleEventModel = {
    find: jest.fn(),
    deleteMany: jest.fn(),
    insertMany: jest.fn(),
  };
  const pendingAppleEventModel = {
    create: jest.fn(),
    find: jest.fn(),
    findOneAndUpdate: jest.fn(),
    deleteMany: jest.fn(),
  };

  function createService() {
    return new CalendarService(
      userService as any,
      configService as any,
      apnsService as any,
      appleEventModel as any,
      pendingAppleEventModel as any,
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
    userService.findOne.mockResolvedValue({ timeZone: 'Asia/Seoul' });
    appleEventModel.deleteMany.mockResolvedValue({ deletedCount: 0 });
    appleEventModel.insertMany.mockResolvedValue([]);
    userService.markAppleCalendarSynced.mockResolvedValue({});
  });

  it('reads the selected Apple Calendar snapshot for a requested day', async () => {
    userService.getCalendarProvider.mockResolvedValue('apple');
    const lean = jest.fn().mockResolvedValue([
      {
        externalId: 'event-1',
        summary: '회의',
        description: null,
        start: '2026-08-03T09:00:00Z',
        end: '2026-08-03T10:00:00Z',
        location: '회의실',
      },
    ]);
    const sort = jest.fn().mockReturnValue({ lean });
    appleEventModel.find.mockReturnValue({ sort });

    await expect(createService().getSchedule('user-1', '2026-08-03')).resolves.toEqual([
      {
        id: 'event-1',
        summary: '회의',
        description: null,
        start: '2026-08-03T09:00:00Z',
        end: '2026-08-03T10:00:00Z',
        location: '회의실',
      },
    ]);
    expect(appleEventModel.find).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1' }),
    );
  });

  it('replaces the Apple Calendar snapshot and records the sync time', async () => {
    userService.getCalendarStatus.mockResolvedValue({ appleConnected: true });

    const result = await createService().syncAppleCalendar('user-1', {
      events: [
        {
          externalId: 'event-1',
          title: '아침 회의',
          startTime: '2026-08-03T09:00:00+09:00',
          endTime: '2026-08-03T10:00:00+09:00',
          location: '회의실',
        },
      ],
    });

    expect(appleEventModel.deleteMany).toHaveBeenCalledWith({ userId: 'user-1' });
    expect(appleEventModel.insertMany).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          userId: 'user-1',
          externalId: 'event-1',
          summary: '아침 회의',
          allDay: false,
        }),
      ],
      { ordered: false },
    );
    expect(userService.markAppleCalendarSynced).toHaveBeenCalledWith(
      'user-1',
      expect.any(Date),
    );
    expect(result).toEqual({ synced: 1, syncedAt: expect.any(String) });
  });

  it('queues spoken event additions for the iPhone and sends a background push', async () => {
    userService.getCalendarProvider.mockResolvedValue('apple');
    userService.getUserDeviceToken.mockResolvedValue({
      deviceType: 'ios',
      notificationToken: 'notification-token',
      apnsEnvironment: 'sandbox',
    });
    pendingAppleEventModel.create.mockResolvedValue({
      _id: { toString: () => 'pending-1' },
    });
    apnsService.sendAppleCalendarSyncPush.mockResolvedValue({ sent: [{}], failed: [] });

    await expect(
      createService().createEvent('user-1', {
        userId: 'user-1',
        title: '치과',
        startTime: '2026-08-03T14:00:00+09:00',
      }),
    ).resolves.toEqual(
      expect.objectContaining({ success: true, pending: true, eventId: 'pending-1' }),
    );
    expect(pendingAppleEventModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        title: '치과',
        endTime: expect.any(String),
      }),
    );
    expect(apnsService.sendAppleCalendarSyncPush).toHaveBeenCalledWith(
      'notification-token',
      'sandbox',
    );
  });
});
