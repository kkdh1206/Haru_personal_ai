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
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemorySchema = exports.Memory = void 0;
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
let Memory = class Memory {
};
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'User', required: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], Memory.prototype, "userId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Memory.prototype, "conversationId", void 0);
__decorate([
    (0, mongoose_1.Prop)({
        required: true,
        enum: ['legacy_message', 'call_record', 'long_term_memory', 'reminder'],
        default: 'legacy_message',
    }),
    __metadata("design:type", String)
], Memory.prototype, "memoryType", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, enum: ['user', 'assistant', 'system'] }),
    __metadata("design:type", String)
], Memory.prototype, "role", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Memory.prototype, "content", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: String, default: null }),
    __metadata("design:type", String)
], Memory.prototype, "summary", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Object, default: {} }),
    __metadata("design:type", Object)
], Memory.prototype, "metadata", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: String, default: null }),
    __metadata("design:type", String)
], Memory.prototype, "chromaId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: String, default: null }),
    __metadata("design:type", String)
], Memory.prototype, "normalizedContent", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: Date.now }),
    __metadata("design:type", Date)
], Memory.prototype, "timestamp", void 0);
Memory = __decorate([
    (0, mongoose_1.Schema)({
        timestamps: true,
        collection: 'memories',
    })
], Memory);
exports.Memory = Memory;
exports.MemorySchema = mongoose_1.SchemaFactory.createForClass(Memory);
exports.MemorySchema.index({ userId: 1, memoryType: 1, timestamp: -1 });
exports.MemorySchema.index({ conversationId: 1, timestamp: 1 });
exports.MemorySchema.index({ userId: 1, conversationId: 1, memoryType: 1 });
exports.MemorySchema.index({ userId: 1, memoryType: 1, normalizedContent: 1 });
//# sourceMappingURL=memory.schema.js.map