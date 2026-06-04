import { Inject, Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import Parser from 'rss-parser';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import Redis from 'ioredis';
import { rssFeeds } from './topic';
import { ConfigService } from '@nestjs/config';

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
    const cacheKey = `weather:v2:${location}`;

    return this.getOrSetCache(cacheKey, async () => {
      // getOrSetCache가 데이터 오래된거면 아래 함수 fetcher()를 수행시킴
      const url = 'https://api.openweathermap.org/data/2.5/weather';
      try {
        const res = await firstValueFrom(
          this.http.get(url, {
            params: {
              q: location,
              appid: this.configService.get<string>('weather.apiKey'),
              units: 'metric',
              lang: 'kr',
            },
          }),
        );
        const data = res.data;

        // 정제된 형태로 가공
        const refined = {
          city: data.name,
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
        console.error(`Error fetching weather for ${location}`, e);
        return null;
      }
    });
  }

  private async getOrSetCache<T>(
    key: string,
    fetcher: () => Promise<T>,
  ): Promise<T> {
    const cached = await this.redisClient.get(key);
    if (cached) {
      const parsed = JSON.parse(cached);
      const now = Date.now();
      if (now - parsed.fetchedAt < 1000 * 60 * 60 * 24) {
        // 하루 기준으로 최신 데이터가 존재한다면 갱신하지 않음
        return parsed.data;
      }
    }

    const data = await fetcher();
    await this.redisClient.set(
      key,
      JSON.stringify({ fetchedAt: Date.now(), data }),
      'EX',
      60 * 60 * 30, // 30시간 TTL
    );
    return data;
  }
}
