import { ForbiddenException } from '@nestjs/common';
import {
  AgentSecretGuard,
  HARU_AGENT_SECRET_HEADER,
} from './agent-secret.guard';

describe('AgentSecretGuard', () => {
  const context = (provided?: string) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          headers: provided ? { [HARU_AGENT_SECRET_HEADER]: provided } : {},
        }),
      }),
    }) as any;

  function guard(expected?: string) {
    return new AgentSecretGuard({
      get: jest.fn().mockReturnValue(expected),
    } as any);
  }

  it('allows the configured server-to-server secret', () => {
    expect(guard('shared-secret').canActivate(context('shared-secret'))).toBe(
      true,
    );
  });

  it('fails closed when the server secret is not configured', () => {
    expect(() => guard('').canActivate(context('anything'))).toThrow(
      ForbiddenException,
    );
  });

  it('rejects missing and mismatched headers without exposing the secret', () => {
    const secured = guard('shared-secret');
    expect(() => secured.canActivate(context())).toThrow('Access denied.');
    expect(() => secured.canActivate(context('wrong-secret'))).toThrow(
      'Access denied.',
    );
  });
});
