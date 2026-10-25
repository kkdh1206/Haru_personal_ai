import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';

export const HARU_AGENT_SECRET_HEADER = 'x-haru-agent-secret';

/** Protects server-to-server routes used by the LiveKit worker. */
@Injectable()
export class AgentSecretGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = String(this.config.get('agent.sharedSecret') || '').trim();
    const provided = context.switchToHttp().getRequest()?.headers?.[
      HARU_AGENT_SECRET_HEADER
    ];

    if (!expected || typeof provided !== 'string' || !provided) {
      throw new ForbiddenException('Access denied.');
    }

    const expectedBuffer = Buffer.from(expected);
    const providedBuffer = Buffer.from(provided);
    if (
      expectedBuffer.length !== providedBuffer.length ||
      !timingSafeEqual(expectedBuffer, providedBuffer)
    ) {
      throw new ForbiddenException('Access denied.');
    }

    return true;
  }
}
