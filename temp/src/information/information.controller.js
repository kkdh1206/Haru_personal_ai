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
Object.defineProperty(exports, "__esModule", { value: true });
exports.InformationController = void 0;
const common_1 = require("@nestjs/common");
const information_service_1 = require("./information.service");
const swagger_1 = require("@nestjs/swagger");
let InformationController = class InformationController {
    constructor(informationService) {
        this.informationService = informationService;
    }
    async refillNews() {
        await this.informationService.checkInformation();
    }
    async getRssNews(topic) {
        return await this.informationService.getCurrentNews(topic);
    }
    async getWeather(location) {
        return await this.informationService.getCurrentWeather(location);
    }
};
__decorate([
    (0, common_1.Get)('refill-news'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], InformationController.prototype, "refillNews", null);
__decorate([
    (0, common_1.Get)('news/:topic'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({
        summary: '뉴스 조회',
        description: '뉴스를 조회합니다.',
    }),
    __param(0, (0, common_1.Param)('topic')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], InformationController.prototype, "getRssNews", null);
__decorate([
    (0, common_1.Get)('weather/:loc'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({
        summary: '날씨 조회',
        description: '날씨를 조회합니다.',
    }),
    __param(0, (0, common_1.Param)('loc')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], InformationController.prototype, "getWeather", null);
InformationController = __decorate([
    (0, common_1.Controller)('information'),
    __metadata("design:paramtypes", [information_service_1.InformationService])
], InformationController);
exports.InformationController = InformationController;
//# sourceMappingURL=information.controller.js.map