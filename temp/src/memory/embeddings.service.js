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
var EmbeddingsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmbeddingsService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const generative_ai_1 = require("@google/generative-ai");
let EmbeddingsService = EmbeddingsService_1 = class EmbeddingsService {
    constructor(configService) {
        this.configService = configService;
        this.logger = new common_1.Logger(EmbeddingsService_1.name);
        this.genAI = null;
        const apiKey = this.configService.get('GOOGLE_API_KEY') ||
            this.configService.get('GEMINI_API_KEY');
        if (!apiKey) {
            this.logger.warn('Embedding API key is not configured. Vector memory features are disabled.');
            return;
        }
        this.genAI = new generative_ai_1.GoogleGenerativeAI(apiKey);
    }
    isEnabled() {
        return this.genAI !== null;
    }
    async generateEmbedding(text) {
        if (!this.genAI) {
            throw new Error('Embedding service is disabled');
        }
        try {
            const model = this.genAI.getGenerativeModel({
                model: 'gemini-embedding-001',
            });
            const result = await model.embedContent(text);
            const embedding = result.embedding;
            this.logger.debug(`Generated embedding for text (length: ${text.length})`);
            return embedding.values;
        }
        catch (error) {
            this.logger.error(`Failed to generate embedding: ${error.message}`, error.stack);
            throw new Error(`Embedding generation failed: ${error.message}`);
        }
    }
    async generateEmbeddings(texts) {
        try {
            const embeddings = await Promise.all(texts.map((text) => this.generateEmbedding(text)));
            this.logger.debug(`Generated ${embeddings.length} embeddings`);
            return embeddings;
        }
        catch (error) {
            this.logger.error(`Failed to generate batch embeddings: ${error.message}`, error.stack);
            throw new Error(`Batch embedding generation failed: ${error.message}`);
        }
    }
};
EmbeddingsService = EmbeddingsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], EmbeddingsService);
exports.EmbeddingsService = EmbeddingsService;
//# sourceMappingURL=embeddings.service.js.map