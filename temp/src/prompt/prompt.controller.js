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
exports.PromptController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const prompt_service_1 = require("./prompt.service");
let PromptController = class PromptController {
    constructor(promptService) {
        this.promptService = promptService;
    }
    async getPrompt(dto) {
        return this.promptService.getPrompt(dto.alarmId);
    }
};
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({
        summary: '프롬프트 가져오기',
        description: '알람 uid에 알맞은 프롬프트를 가져옵니다.',
    }),
    (0, swagger_1.ApiBody)({
        type: String,
        required: true,
        description: '알람 uid',
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PromptController.prototype, "getPrompt", null);
PromptController = __decorate([
    (0, common_1.Controller)('prompt'),
    __metadata("design:paramtypes", [prompt_service_1.PromptService])
], PromptController);
exports.PromptController = PromptController;
//# sourceMappingURL=prompt.controller.js.map