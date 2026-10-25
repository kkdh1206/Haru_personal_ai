import { HttpModule, HttpService } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BillingModule } from 'src/billing/billing.module';
import { CalendarModule } from 'src/calendar/calendar.module';
import { MemoryModule } from 'src/memory/memory.module';
import { UserModule } from 'src/user/user.module';
import { AssistantController } from './assistant.controller';
import { AssistantRateLimiter } from './assistant-rate-limiter.service';
import { AssistantService } from './assistant.service';
import { ClaudeLlmProvider } from './llm/claude-llm.provider';
import { LLM_PROVIDER_TOKEN } from './llm/llm-provider';
import { UnavailableLlmProvider } from './llm/unavailable-llm.provider';

@Module({
  imports: [
    ConfigModule,
    HttpModule,
    UserModule,
    CalendarModule,
    MemoryModule,
    BillingModule,
  ],
  controllers: [AssistantController],
  providers: [
    AssistantService,
    AssistantRateLimiter,
    {
      provide: LLM_PROVIDER_TOKEN,
      inject: [ConfigService, HttpService],
      useFactory: (config: ConfigService, http: HttpService) => {
        const provider = String(config.get('llm.provider') || 'claude')
          .trim()
          .toLowerCase();
        const model = String(
          config.get('llm.anthropic.model') || 'claude-sonnet-5-5',
        ).trim();

        if (provider !== 'claude') {
          return new UnavailableLlmProvider(provider || 'unknown', model);
        }

        return new ClaudeLlmProvider(http, {
          apiKey: String(config.get('llm.anthropic.apiKey') || ''),
          model,
          baseUrl: String(
            config.get('llm.anthropic.baseUrl') || 'https://api.anthropic.com',
          ),
          timeoutMs: Number(config.get('llm.anthropic.timeoutMs') || 20_000),
        });
      },
    },
  ],
  exports: [AssistantService, LLM_PROVIDER_TOKEN],
})
export class AssistantModule {}
