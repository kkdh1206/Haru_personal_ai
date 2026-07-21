import { ConfigService } from '@nestjs/config';
export declare class EmbeddingsService {
    private configService;
    private readonly logger;
    private genAI;
    constructor(configService: ConfigService);
    isEnabled(): boolean;
    generateEmbedding(text: string): Promise<number[]>;
    generateEmbeddings(texts: string[]): Promise<number[][]>;
}
