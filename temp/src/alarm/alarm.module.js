"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AlarmModule = void 0;
const common_1 = require("@nestjs/common");
const alarm_controller_1 = require("./alarm.controller");
const alarm_service_1 = require("./alarm.service");
const axios_1 = require("@nestjs/axios");
const alarm_schema_1 = require("./schemas/alarm.schema");
const mongoose_1 = require("@nestjs/mongoose");
const user_module_1 = require("../user/user.module");
const apns_service_1 = require("../apns/apns.service");
const calendar_module_1 = require("../calendar/calendar.module");
const information_module_1 = require("../information/information.module");
const alarm_processor_1 = require("./alarm.processor");
const bullmq_1 = require("@nestjs/bullmq");
const bull_board_module_1 = require("../bull-board/bull-board.module");
const livekit_service_1 = require("../livekit/livekit.service");
const prompt_module_1 = require("../prompt/prompt.module");
const fcm_service_1 = require("../fcm/fcm.service");
let AlarmModule = class AlarmModule {
};
AlarmModule = __decorate([
    (0, common_1.Module)({
        imports: [
            mongoose_1.MongooseModule.forFeature([{ name: alarm_schema_1.Alarm.name, schema: alarm_schema_1.AlarmSchema }]),
            bullmq_1.BullModule.forRoot({
                connection: { host: 'localhost', port: 6379 },
            }),
            bullmq_1.BullModule.registerQueue({ name: 'alarm' }),
            bull_board_module_1.BullBoardModule,
            axios_1.HttpModule,
            user_module_1.UserModule,
            calendar_module_1.CalendarModule,
            information_module_1.InformationModule,
            prompt_module_1.PromptModule,
        ],
        controllers: [alarm_controller_1.AlarmController],
        providers: [
            alarm_service_1.AlarmService,
            alarm_processor_1.AlarmProcessor,
            apns_service_1.ApnsService,
            fcm_service_1.FcmService,
            livekit_service_1.LivekitService,
        ],
        exports: [alarm_service_1.AlarmService, calendar_module_1.CalendarModule, information_module_1.InformationModule],
    })
], AlarmModule);
exports.AlarmModule = AlarmModule;
//# sourceMappingURL=alarm.module.js.map