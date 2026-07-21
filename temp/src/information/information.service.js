"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InformationService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const rss_parser_1 = __importDefault(require("rss-parser"));
const axios_1 = require("@nestjs/axios");
const rxjs_1 = require("rxjs");
const ioredis_1 = __importDefault(require("ioredis"));
const topic_1 = require("./topic");
const config_1 = require("@nestjs/config");
let InformationService = class InformationService {
    constructor(http, configService, redisClient) {
        this.http = http;
        this.configService = configService;
        this.redisClient = redisClient;
        this.parser = new rss_parser_1.default({
            requestOptions: {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; MyAIMorningApp/1.0)',
                },
            },
        });
    }
    async checkInformation() {
        for (const { url, topic } of topic_1.rssFeeds) {
            try {
                const result = await this.fetchNews(url, topic);
                console.log(`[Cron] Fetched ${result.length} items for ${topic}`);
            }
            catch (e) {
                console.error(`[Cron] Error fetching news for ${topic}`, e);
            }
        }
    }
    async fetchNews(rssUrl, topic) {
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
    async getCurrentNews(topic) {
        var _a;
        const raw = await this.redisClient.get(`news:${topic}`);
        if (!raw) {
            return [];
        }
        try {
            const parsed = JSON.parse(raw);
            return (_a = parsed === null || parsed === void 0 ? void 0 : parsed.data) !== null && _a !== void 0 ? _a : [];
        }
        catch (e) {
            console.error(`Error parsing cached news for ${topic}`, e);
            return [];
        }
    }
    async getCurrentWeather(location) {
        const cacheKey = `weather:v3:${location}`;
        return this.getOrSetCache(cacheKey, async () => {
            var _a, _b, _c, _d, _e, _f, _g, _h;
            const url = 'https://api.openweathermap.org/data/2.5/weather';
            try {
                const res = await (0, rxjs_1.firstValueFrom)(this.http.get(url, {
                    params: {
                        q: location,
                        appid: this.configService.get('weather.apiKey'),
                        units: 'metric',
                        lang: 'kr',
                    },
                }));
                const data = res.data;
                const refined = {
                    city: data.name,
                    country: (_a = data.sys) === null || _a === void 0 ? void 0 : _a.country,
                    requested_location: location,
                    observed_at: data.dt
                        ? new Date(data.dt * 1000).toISOString()
                        : null,
                    fetched_at: new Date().toISOString(),
                    temperature: data.main.temp,
                    feels_like: data.main.feels_like,
                    temp_min: data.main.temp_min,
                    temp_max: data.main.temp_max,
                    weather: (_c = (_b = data.weather) === null || _b === void 0 ? void 0 : _b[0]) === null || _c === void 0 ? void 0 : _c.description,
                    icon: (_e = (_d = data.weather) === null || _d === void 0 ? void 0 : _d[0]) === null || _e === void 0 ? void 0 : _e.icon,
                    humidity: data.main.humidity,
                    pressure: data.main.pressure,
                    wind_speed: data.wind.speed,
                    wind_gust: data.wind.gust,
                    cloudiness: (_f = data.clouds) === null || _f === void 0 ? void 0 : _f.all,
                    visibility: data.visibility,
                    rain_1h: (_g = data.rain) === null || _g === void 0 ? void 0 : _g['1h'],
                    snow_1h: (_h = data.snow) === null || _h === void 0 ? void 0 : _h['1h'],
                };
                return refined;
            }
            catch (e) {
                console.error(`Error fetching weather for ${location}`, e);
                return null;
            }
        }, {
            maxAgeMs: 1000 * 60 * 15,
            ttlSeconds: 60 * 30,
        });
    }
    async getOrSetCache(key, fetcher, options = {}) {
        var _a, _b;
        const cached = await this.redisClient.get(key);
        if (cached) {
            const parsed = JSON.parse(cached);
            const now = Date.now();
            const maxAgeMs = (_a = options.maxAgeMs) !== null && _a !== void 0 ? _a : 1000 * 60 * 60 * 3;
            if (now - parsed.fetchedAt < maxAgeMs) {
                return parsed.data;
            }
        }
        const data = await fetcher();
        await this.redisClient.set(key, JSON.stringify({ fetchedAt: Date.now(), data }), 'EX', (_b = options.ttlSeconds) !== null && _b !== void 0 ? _b : 60 * 60 * 4);
        return data;
    }
};
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_DAY_AT_5AM),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], InformationService.prototype, "checkInformation", null);
InformationService = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, common_1.Inject)('REDIS')),
    __metadata("design:paramtypes", [axios_1.HttpService,
        config_1.ConfigService,
        ioredis_1.default])
], InformationService);
exports.InformationService = InformationService;
//# sourceMappingURL=information.service.js.map