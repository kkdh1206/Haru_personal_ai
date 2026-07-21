import { HttpService } from '@nestjs/axios';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';
export declare class InformationService {
    private readonly http;
    private readonly configService;
    private readonly redisClient;
    private parser;
    constructor(http: HttpService, configService: ConfigService, redisClient: Redis);
    checkInformation(): Promise<void>;
    fetchNews(rssUrl: string, topic: string): Promise<{
        title: string;
        summary: string;
        link: string;
    }[]>;
    getCurrentNews(topic: string): Promise<any>;
    getCurrentWeather(location: string): Promise<{
        city: any;
        country: any;
        requested_location: string;
        observed_at: string;
        fetched_at: string;
        temperature: any;
        feels_like: any;
        temp_min: any;
        temp_max: any;
        weather: any;
        icon: any;
        humidity: any;
        pressure: any;
        wind_speed: any;
        wind_gust: any;
        cloudiness: any;
        visibility: any;
        rain_1h: any;
        snow_1h: any;
    }>;
    private getOrSetCache;
}
