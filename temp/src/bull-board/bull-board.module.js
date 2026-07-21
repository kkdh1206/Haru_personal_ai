"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BullBoardModule = void 0;
const common_1 = require("@nestjs/common");
const api_1 = require("@bull-board/api");
const express_1 = require("@bull-board/express");
const bullMQAdapter_1 = require("@bull-board/api/bullMQAdapter");
const express = __importStar(require("express"));
const admin = __importStar(require("firebase-admin"));
const user_service_1 = require("../user/user.service");
const bullmq_1 = require("bullmq");
const bullmq_2 = require("@nestjs/bullmq");
const user_module_1 = require("../user/user.module");
const bullmq_3 = require("@nestjs/bullmq");
let BullBoardModule = class BullBoardModule {
    constructor(alarmQueue, userService) {
        this.alarmQueue = alarmQueue;
        this.userService = userService;
    }
    configure(consumer) {
        const serverAdapter = new express_1.ExpressAdapter();
        serverAdapter.setBasePath('/admin/queues');
        (0, api_1.createBullBoard)({
            queues: [new bullMQAdapter_1.BullMQAdapter(this.alarmQueue)],
            serverAdapter,
        });
        const wrapper = express.Router();
        wrapper.use(async (req, res, next) => {
            var _a, _b, _c;
            const bearer = ((_b = (_a = req.headers) === null || _a === void 0 ? void 0 : _a.authorization) === null || _b === void 0 ? void 0 : _b.startsWith('Bearer '))
                ? req.headers.authorization.replace('Bearer ', '')
                : null;
            const token = bearer !== null && bearer !== void 0 ? bearer : (_c = req.cookies) === null || _c === void 0 ? void 0 : _c.access_token;
            if (!token)
                return res.redirect('/admin/auth');
            try {
                const decoded = await admin.auth().verifyIdToken(token);
                const user = await this.userService.oauthSync(decoded.uid, decoded.email);
                if (user.role !== 'admin')
                    return res.status(403).send('Forbidden');
                req.user = user;
                next();
            }
            catch (_d) {
                return res.redirect('/admin/auth');
            }
        });
        wrapper.use('/admin/queues', serverAdapter.getRouter());
        consumer.apply(wrapper).forRoutes({
            path: '/admin/queues',
            method: common_1.RequestMethod.ALL,
        }, {
            path: '/admin/queues/*path',
            method: common_1.RequestMethod.ALL,
        });
    }
};
BullBoardModule = __decorate([
    (0, common_1.Module)({
        imports: [user_module_1.UserModule, bullmq_3.BullModule.registerQueue({ name: 'alarm' })],
    }),
    __param(0, (0, bullmq_2.InjectQueue)('alarm')),
    __metadata("design:paramtypes", [bullmq_1.Queue,
        user_service_1.UserService])
], BullBoardModule);
exports.BullBoardModule = BullBoardModule;
//# sourceMappingURL=bull-board.module.js.map