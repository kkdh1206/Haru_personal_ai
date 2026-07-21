"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const app_controller_1 = require("./app.controller");
const app_service_1 = require("./app.service");
const config_1 = require("@nestjs/config");
const configuration_1 = __importDefault(require("./config/configuration"));
const axios_1 = require("@nestjs/axios");
const alarm_module_1 = require("./alarm/alarm.module");
const user_module_1 = require("./user/user.module");
const mongoose_1 = require("@nestjs/mongoose");
const schedule_1 = require("@nestjs/schedule");
const information_module_1 = require("./information/information.module");
const redis_module_1 = require("./redis/redis.module");
const calendar_module_1 = require("./calendar/calendar.module");
const livekit_service_1 = require("./livekit/livekit.service");
const prompt_module_1 = require("./prompt/prompt.module");
const livekit_controller_1 = require("./livekit/livekit.controller");
const memory_module_1 = require("./memory/memory.module");
let AppModule = class AppModule {
};
AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({
                load: [configuration_1.default],
                isGlobal: true,
            }),
            schedule_1.ScheduleModule.forRoot(),
            mongoose_1.MongooseModule.forRootAsync({
                imports: [config_1.ConfigModule],
                useFactory: (cs) => ({
                    uri: cs.get('mongo.uri'),
                    dbName: cs.get('mongo.dbName'),
                }),
                inject: [config_1.ConfigService],
            }),
            axios_1.HttpModule,
            redis_module_1.RedisModule,
            alarm_module_1.AlarmModule,
            user_module_1.UserModule,
            information_module_1.InformationModule,
            calendar_module_1.CalendarModule,
            prompt_module_1.PromptModule,
            memory_module_1.MemoryModule,
        ],
        controllers: [app_controller_1.AppController, livekit_controller_1.LivekitController],
        providers: [app_service_1.AppService, livekit_service_1.LivekitService],
    })
], AppModule);
exports.AppModule = AppModule;
//# sourceMappingURL=app.module.js.map