"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserModule = void 0;
const common_1 = require("@nestjs/common");
const user_controller_1 = require("./user.controller");
const user_service_1 = require("./user.service");
const mongoose_1 = require("@nestjs/mongoose");
const user_schema_1 = require("./schemas/user.schema");
const crypto_service_1 = require("../utils/crypto.service");
const auth_controller_1 = require("../auth/auth.controller");
const alarm_schema_1 = require("../alarm/schemas/alarm.schema");
const memory_schema_1 = require("../memory/schemas/memory.schema");
const user_profile_schema_1 = require("../memory/schemas/user-profile.schema");
let UserModule = class UserModule {
};
UserModule = __decorate([
    (0, common_1.Module)({
        imports: [
            mongoose_1.MongooseModule.forFeature([
                { name: user_schema_1.User.name, schema: user_schema_1.UserSchema },
                { name: alarm_schema_1.Alarm.name, schema: alarm_schema_1.AlarmSchema },
                { name: memory_schema_1.Memory.name, schema: memory_schema_1.MemorySchema },
                { name: user_profile_schema_1.UserProfile.name, schema: user_profile_schema_1.UserProfileSchema },
            ]),
        ],
        controllers: [user_controller_1.UserController, auth_controller_1.AuthController],
        providers: [user_service_1.UserService, crypto_service_1.CryptoService],
        exports: [user_service_1.UserService],
    })
], UserModule);
exports.UserModule = UserModule;
//# sourceMappingURL=user.module.js.map