import { InformationService } from './information.service';
export declare class InformationController {
    private readonly informationService;
    constructor(informationService: InformationService);
    refillNews(): Promise<void>;
    getRssNews(topic: string): Promise<any>;
    getWeather(location: string): Promise<{
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
}
