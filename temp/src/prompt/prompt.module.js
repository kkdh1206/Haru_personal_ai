"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PromptModule = void 0;
const common_1 = require("@nestjs/common");
const prompt_controller_1 = require("./prompt.controller");
const axios_1 = require("@nestjs/axios");
const alarm_module_1 = require("../alarm/alarm.module");
const prompt_service_1 = require("./prompt.service");
let PromptModule = class PromptModule {
};
PromptModule = __decorate([
    (0, common_1.Module)({
        imports: [axios_1.HttpModule, (0, common_1.forwardRef)(() => alarm_module_1.AlarmModule)],
        controllers: [prompt_controller_1.PromptController],
        providers: [prompt_service_1.PromptService],
        exports: [prompt_service_1.PromptService],
    })
], PromptModule);
exports.PromptModule = PromptModule;
//# sourceMappingURL=prompt.module.js.map