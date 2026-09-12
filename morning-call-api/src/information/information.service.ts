import { Inject, Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import Parser from 'rss-parser';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import Redis from 'ioredis';
import { rssFeeds } from './topic';
import { ConfigService } from '@nestjs/config';

export function normalizeWeatherLocation(location: string): string {
  const parts = location
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  const city = parts[0] === '몬트리올' ? 'Montreal' : parts[0] || '';
  const region = parts[1] || '';
  if (parts.length >= 3 && /^[a-z]{2}$/i.test(parts[parts.length - 1])) {
    const country = parts[parts.length - 1].toUpperCase();
    // OpenWeather's built-in state-code parameter is supported only for the US.
    return country === 'US' ? `${city},${region},US` : `${city},${country}`;
  }
  // Previously saved iOS locations omitted the country (e.g. Montréal, QC).
  // CA is deliberately excluded: "city,CA" already means the country Canada.
  if (
    parts.length === 2 &&
    /^(AB|BC|MB|NB|NL|NS|NT|NU|ON|PE|QC|SK|YT|qu[eé]bec|퀘벡(?:주)?|ontario|온타리오(?:주)?)$/i.test(
      region,
    )
  ) {
    return `${city},CA`;
  }
  return [city, ...parts.slice(1)].filter(Boolean).join(',');
}

@Injectable()
export class InformationService {
  private parser: Parser;

  constructor(
    private readonly http: HttpService,
    private readonly configService: ConfigService,
    @Inject('REDIS') private readonly redisClient: Redis,
  ) {
    this.parser = new Parser({
      requestOptions: {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; MyAIMorningApp/1.0)',
        },
      },
    });
  }

  @Cron(CronExpression.EVERY_DAY_AT_5AM) // 매일 5시마다 뉴스 기사 업데이트
  async checkInformation() {
    for (const { url, topic } of rssFeeds) {
      try {
        const result = await this.fetchNews(url, topic);
        console.log(`[Cron] Fetched ${result.length} items for ${topic}`);
      } catch (e) {
        console.error(`[Cron] Error fetching news for ${topic}`, e);
      }
    }
  }

  async fetchNews(rssUrl: string, topic: string) {
    const cacheKey = `news:${topic}`;
    return this.getOrSetCache(cacheKey, async () => {
      const feed = await this.parser.parseURL(encodeURI(rssUrl));
      return feed.items.slice(0, 3).map((item) => ({
        title: item.title,
        summary: item.contentSnippet,
        link: item.link,
      }));
    });
  }

  // Topic에 따른 뉴스 가져오기
  async getCurrentNews(topic: string) {
    const raw = await this.redisClient.get(`news:${topic}`);
    if (!raw) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw);
      return parsed?.data ?? [];
    } catch (e) {
      console.error(`Error parsing cached news for ${topic}`, e);
      return [];
    }
  }

  // 날씨 데이터 가져오기
  async getCurrentWeather(location: string) {
    const queryLocation = normalizeWeatherLocation(location);
    const cacheKey = `weather:v4:${queryLocation}`;

    return this.getOrSetCache(
      cacheKey,
      async () => {
        // getOrSetCache가 데이터 오래된거면 아래 함수 fetcher()를 수행시킴
        const url = 'https://api.openweathermap.org/data/2.5/weather';
        try {
          const res = await firstValueFrom(
            this.http.get(url, {
              params: {
                q: queryLocation,
                appid: this.configService.get<string>('weather.apiKey'),
                units: 'metric',
                lang: 'kr',
              },
              timeout: 5000,
            }),
          );
          const data = res.data;

          // 정제된 형태로 가공
          const refined = {
            city: data.name,
            country: data.sys?.country,
            requested_location: location,
            observed_at: data.dt
              ? new Date(data.dt * 1000).toISOString()
              : null,
            fetched_at: new Date().toISOString(),
            temperature: data.main.temp,
            feels_like: data.main.feels_like,
            temp_min: data.main.temp_min,
            temp_max: data.main.temp_max,
            weather: data.weather?.[0]?.description,
            icon: data.weather?.[0]?.icon,
            humidity: data.main.humidity,
            pressure: data.main.pressure,
            wind_speed: data.wind.speed,
            wind_gust: data.wind.gust,
            cloudiness: data.clouds?.all,
            visibility: data.visibility,
            rain_1h: data.rain?.['1h'],
            snow_1h: data.snow?.['1h'],
          };

          return refined;
        } catch (e) {
          // Axios errors contain request config, including appid. Log only status.
          console.error(
            `[Weather] lookup failed location=${queryLocation} status=${e?.response?.status || e?.code || 'unknown'}`,
          );
          return null;
        }
      },
      {
        maxAgeMs: 1000 * 60 * 15,
        ttlSeconds: 60 * 30,
      },
    );
  }

  private async getOrSetCache<T>(
    key: string,
    fetcher: () => Promise<T>,
    options: { maxAgeMs?: number; ttlSeconds?: number } = {},
  ): Promise<T> {
    try {
      const cached = await this.redisClient.get(key);
      const parsed = cached ? JSON.parse(cached) : null;
      const now = Date.now();
      const maxAgeMs = options.maxAgeMs ?? 1000 * 60 * 60 * 3;
      if (parsed?.data != null && now - parsed.fetchedAt < maxAgeMs) {
        // 설정된 최신성 기준 안이면 갱신하지 않음
        return parsed.data;
      }
    } catch {
      // A cache failure must not prevent fetching current information.
      console.warn(`[Information] cache read failed key=${key}`);
    }

    const data = await fetcher();
    if (data == null) return data;
    try {
      await this.redisClient.set(
        key,
        JSON.stringify({ fetchedAt: Date.now(), data }),
        'EX',
        options.ttlSeconds ?? 60 * 60 * 4,
      );
    } catch {
      console.warn(`[Information] cache write failed key=${key}`);
    }
    return data;
  }
}
