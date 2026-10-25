import { ConfigModule } from '@nestjs/config';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { AlarmController } from 'src/alarm/alarm.controller';
import { AlarmService } from 'src/alarm/alarm.service';
import { CalendarController } from 'src/calendar/calendar.controller';
import { CalendarService } from 'src/calendar/calendar.service';
import { MemoryController } from 'src/memory/memory.controller';
import { MemoryService } from 'src/memory/memory.service';
import { PromptController } from 'src/prompt/prompt.controller';
import { PromptService } from 'src/prompt/prompt.service';
import { UserService } from 'src/user/user.service';
import { AgentSecretGuard } from './agent-secret.guard';
import { InternalAuthModule } from './internal-auth.module';

const guardsFor = (target: object) =>
  (Reflect.getMetadata(GUARDS_METADATA, target) || []) as unknown[];

describe('worker-only route guards', () => {
  it('protects internal controllers and worker-only methods', () => {
    expect(guardsFor(MemoryController)).toContain(AgentSecretGuard);
    expect(guardsFor(PromptController)).toContain(AgentSecretGuard);
    expect(guardsFor(CalendarController.prototype.createEvent)).toContain(
      AgentSecretGuard,
    );
    expect(guardsFor(AlarmController.prototype.retry)).toContain(
      AgentSecretGuard,
    );
    expect(guardsFor(AlarmController.prototype.reportCallOutcome)).toContain(
      AgentSecretGuard,
    );
  });

  it('does not add the worker secret guard to Firebase mobile methods', () => {
    expect(
      guardsFor(CalendarController.prototype.getTodayEvents),
    ).not.toContain(AgentSecretGuard);
    expect(guardsFor(AlarmController.prototype.create)).not.toContain(
      AgentSecretGuard,
    );
  });

  it('resolves the guard while initializing the real controllers', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ agent: { sharedSecret: 'test-worker-secret' } })],
        }),
        InternalAuthModule,
      ],
      controllers: [
        MemoryController,
        CalendarController,
        AlarmController,
        PromptController,
      ],
      providers: [
        { provide: MemoryService, useValue: {} },
        { provide: CalendarService, useValue: {} },
        { provide: AlarmService, useValue: {} },
        { provide: PromptService, useValue: {} },
        { provide: UserService, useValue: {} },
      ],
    }).compile();
    const app = moduleRef.createNestApplication();

    await app.init();
    expect(app.get(AgentSecretGuard)).toBeInstanceOf(AgentSecretGuard);
    await app.close();
  });
});
