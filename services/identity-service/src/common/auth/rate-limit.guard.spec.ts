import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  RATE_LIMIT_KEY,
  RateLimitGuard,
  RateLimitRule,
} from './rate-limit.guard';

describe('RateLimitGuard (IAM-08)', () => {
  const makeContext = (
    ip: string,
    email: string,
    rule: RateLimitRule,
  ): {
    context: ExecutionContext;
    guard: RateLimitGuard;
    setHeader: jest.Mock;
  } => {
    const reflector = {
      getAllAndOverride: jest.fn((key: string) =>
        key === RATE_LIMIT_KEY ? rule : undefined,
      ),
    } as unknown as Reflector;

    const guard = new RateLimitGuard(reflector);
    const setHeader = jest.fn();

    const context = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'POST',
          path: '/api/v1/auth/login',
          route: { path: '/api/v1/auth/login' },
          headers: {},
          ip,
          body: { email },
        }),
        getResponse: () => ({ setHeader }),
      }),
    } as unknown as ExecutionContext;

    return { context, guard, setHeader };
  };

  it('allows requests within limit and blocks the request exceeding limit with 429', () => {
    const rule: RateLimitRule = {
      limit: 3,
      windowSeconds: 60,
      keyByEmail: true,
    };
    const { context, guard, setHeader } = makeContext(
      '10.0.0.1',
      'user@lms.edu.vn',
      rule,
    );

    expect(guard.canActivate(context)).toBe(true);
    expect(guard.canActivate(context)).toBe(true);
    expect(guard.canActivate(context)).toBe(true);

    try {
      guard.canActivate(context);
      fail('Expected 429 Too Many Requests');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(
        HttpStatus.TOO_MANY_REQUESTS,
      );
      expect(setHeader).toHaveBeenCalledWith('Retry-After', expect.any(String));
    }
  });
});
