import { Global, Module } from '@nestjs/common';
import { AgentSecretGuard } from './agent-secret.guard';

/** Makes the worker shared-secret guard injectable from feature controllers. */
@Global()
@Module({
  providers: [AgentSecretGuard],
  exports: [AgentSecretGuard],
})
export class InternalAuthModule {}
