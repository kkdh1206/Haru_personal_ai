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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthGuard = void 0;
const common_1 = require("@nestjs/common");
const firebase = __importStar(require("firebase-admin"));
const user_service_1 = require("../user/user.service");
let AuthGuard = class AuthGuard {
    constructor(userService) {
        this.userService = userService;
    }
    extractToken(req) {
        var _a, _b, _c;
        const bearer = (_a = req.headers) === null || _a === void 0 ? void 0 : _a.authorization;
        if (bearer === null || bearer === void 0 ? void 0 : bearer.startsWith('Bearer '))
            return bearer.replace('Bearer ', '');
        return (_c = (_b = req.cookies) === null || _b === void 0 ? void 0 : _b.access_token) !== null && _c !== void 0 ? _c : null;
    }
    async canActivate(context) {
        const request = context.switchToHttp().getRequest();
        const token = this.extractToken(request);
        if (!token)
            throw new common_1.ForbiddenException('Access Denied');
        try {
            const decodedToken = await firebase.auth().verifyIdToken(token);
            request.user = await this.userService.oauthSync(decodedToken.uid, decodedToken.email);
            return true;
        }
        catch (error) {
            return false;
        }
    }
};
AuthGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [user_service_1.UserService])
], AuthGuard);
exports.AuthGuard = AuthGuard;
//# sourceMappingURL=auth.guard.js.map