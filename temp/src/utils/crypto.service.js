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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CryptoService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const crypto_1 = __importDefault(require("crypto"));
let CryptoService = class CryptoService {
    constructor(cs) {
        this.cs = cs;
        this.tokenEncryptionKey = this.cs.get('encryption.key');
        this.algorithm = 'aes-256-cbc';
        this.key = Buffer.from(this.tokenEncryptionKey, 'hex');
    }
    encrypt(text) {
        const iv = crypto_1.default.randomBytes(16);
        const cipher = crypto_1.default.createCipheriv(this.algorithm, this.key, iv);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return `${iv.toString('hex')}:${encrypted}`;
    }
    decrypt(encrypted) {
        const [ivHex, data] = encrypted.split(':');
        const iv = Buffer.from(ivHex, 'hex');
        const decipher = crypto_1.default.createDecipheriv(this.algorithm, this.key, iv);
        let decrypted = decipher.update(data, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }
};
CryptoService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], CryptoService);
exports.CryptoService = CryptoService;
//# sourceMappingURL=crypto.service.js.map