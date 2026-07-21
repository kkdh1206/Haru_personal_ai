"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ControlModule = void 0;
const common_1 = require("@nestjs/common");
const alarm_module_1 = require("../alarm/alarm.module");
const calendar_module_1 = require("../calendar/calendar.module");
const memory_module_1 = require("../memory/memory.module");
const user_module_1 = require("../user/user.module");
const control_controller_1 = require("./control.controller");
const control_service_1 = require("./control.service");
let ControlModule = class ControlModule {
};
ControlModule = __decorate([
    (0, common_1.Module)({
        imports: [alarm_module_1.AlarmModule, calendar_module_1.CalendarModule, memory_module_1.MemoryModule, user_module_1.UserModule],
        controllers: [control_controller_1.ControlController],
        providers: [control_service_1.ControlService],
    })
], ControlModule);
exports.ControlModule = ControlModule;
//# sourceMappingURL=control.module.js.map