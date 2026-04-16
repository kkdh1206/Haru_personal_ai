import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

@Injectable()
export class EmbeddingsService {
  private readonly logger = new Logger(EmbeddingsService.name);
  private genAI: GoogleGenerativeAI | null = null;

  constructor(private configService: ConfigService) {
    const apiKey =
      this.configService.get<string>('GOOGLE_API_KEY') ||
      this.configService.get<string>('GEMINI_API_KEY');

    if (!apiKey) {
      this.logger.warn(
        'Embedding API key is not configured. Vector memory features are disabled.',
      );
      return;
    }

    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  isEnabled(): boolean {
    return this.genAI !== null;
  }

  /**
   * 텍스트를 Gemini Embedding API로 벡터화
   * @param text 임베딩할 텍스트
   * @returns 벡터 배열 (number[])
   */
  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.genAI) {
      throw new Error('Embedding service is disabled');
    }

    try {
      const model = this.genAI.getGenerativeModel({
        model: 'gemini-embedding-001',
      });

      const result = await model.embedContent(text);
      const embedding = result.embedding;

      this.logger.debug(
        `Generated embedding for text (length: ${text.length})`,
      );

      return embedding.values;
    } catch (error) {
      this.logger.error(
        `Failed to generate embedding: ${error.message}`,
        error.stack,
      );
      throw new Error(`Embedding generation failed: ${error.message}`);
    }
  }

  /**
   * 여러 텍스트를 한 번에 임베딩 (배치 처리)
   * @param texts 임베딩할 텍스트 배열
   * @returns 벡터 배열의 배열
   */
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    try {
      const embeddings = await Promise.all(
        texts.map((text) => this.generateEmbedding(text)),
      );

      this.logger.debug(`Generated ${embeddings.length} embeddings`);

      return embeddings;
    } catch (error) {
      this.logger.error(
        `Failed to generate batch embeddings: ${error.message}`,
        error.stack,
      );
      throw new Error(`Batch embedding generation failed: ${error.message}`);
    }
  }
}
