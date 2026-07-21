"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InformationModule = void 0;
const common_1 = require("@nestjs/common");
const information_controller_1 = require("./information.controller");
const information_service_1 = require("./information.service");
const axios_1 = require("@nestjs/axios");
const user_module_1 = require("../user/user.module");
const apns_service_1 = require("../apns/apns.service");
let InformationModule = class InformationModule {
};
InformationModule = __decorate([
    (0, common_1.Module)({
        imports: [axios_1.HttpModule, user_module_1.UserModule],
        controllers: [information_controller_1.InformationController],
        providers: [information_service_1.InformationService, apns_service_1.ApnsService],
        exports: [information_service_1.InformationService],
    })
], InformationModule);
exports.InformationModule = InformationModule;
//# sourceMappingURL=information.module.js.map