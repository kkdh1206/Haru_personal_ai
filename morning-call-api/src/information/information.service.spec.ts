import { of, throwError } from 'rxjs';
import {
  InformationService,
  normalizeWeatherLocation,
} from './information.service';

describe('international weather lookup', () => {
  const sample = {
    name: 'Montreal',
    sys: { country: 'CA' },
    dt: 1789228800,
    main: { temp: 19, feels_like: 18, humidity: 63 },
    weather: [{ description: '맑음', icon: '01d' }],
    wind: { speed: 2 },
  };

  function makeService() {
    const http = { get: jest.fn().mockReturnValue(of({ data: sample })) };
    const redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
    };
    const config = { get: jest.fn().mockReturnValue('test-key-do-not-log') };
    const service = new InformationService(
      http as any,
      config as any,
      redis as any,
    );
    return { service, http, redis };
  }

  afterEach(() => jest.restoreAllMocks());

  it.each([
    ['Montréal, QC', 'Montréal,CA'],
    ['몬트리올, 퀘벡주', 'Montreal,CA'],
    ['Montreal, Quebec, CA', 'Montreal,CA'],
    ['Toronto, ON, CA', 'Toronto,CA'],
    ['Seoul, Seoul, KR', 'Seoul,KR'],
    ['San Francisco, CA, US', 'San Francisco,CA,US'],
    ['Paris, FR', 'Paris,FR'],
  ])(
    'normalizes %s without confusing province and country',
    (input, expected) => {
      expect(normalizeWeatherLocation(input)).toBe(expected);
    },
  );

  it('requests Montreal in Canada using the corrected cache namespace', async () => {
    const { service, http, redis } = makeService();
    await expect(
      service.getCurrentWeather('Montréal, QC'),
    ).resolves.toMatchObject({
      city: 'Montreal',
      country: 'CA',
      temperature: 19,
    });
    expect(http.get).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        params: expect.objectContaining({ q: 'Montréal,CA' }),
        timeout: 5000,
      }),
    );
    expect(redis.get).toHaveBeenCalledWith('weather:v4:Montréal,CA');
  });

  it('does not reuse cached failures or cache a new failure for 15 minutes', async () => {
    const { service, http, redis } = makeService();
    redis.get.mockResolvedValue(
      JSON.stringify({ fetchedAt: Date.now(), data: null }),
    );
    const log = jest.spyOn(console, 'error').mockImplementation();
    http.get.mockReturnValueOnce(
      throwError(() => ({
        response: { status: 404 },
        config: { params: { appid: 'test-key-do-not-log' } },
      })),
    );
    await expect(service.getCurrentWeather('Montreal,CA')).resolves.toBeNull();
    expect(redis.set).not.toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).not.toContain('test-key-do-not-log');
    await expect(
      service.getCurrentWeather('Montreal,CA'),
    ).resolves.toMatchObject({ temperature: 19 });
  });

  it('uses current cached weather without making another provider request', async () => {
    const { service, http, redis } = makeService();
    redis.get.mockResolvedValue(
      JSON.stringify({ fetchedAt: Date.now(), data: { temperature: 19 } }),
    );
    await expect(service.getCurrentWeather('Montreal,CA')).resolves.toEqual({
      temperature: 19,
    });
    expect(http.get).not.toHaveBeenCalled();
  });

  it('still returns weather when Redis is unavailable', async () => {
    const { service, redis } = makeService();
    jest.spyOn(console, 'warn').mockImplementation();
    redis.get.mockRejectedValue(new Error('Redis unavailable'));
    redis.set.mockRejectedValue(new Error('Redis unavailable'));
    await expect(
      service.getCurrentWeather('Montreal,CA'),
    ).resolves.toMatchObject({ temperature: 19 });
  });
});
