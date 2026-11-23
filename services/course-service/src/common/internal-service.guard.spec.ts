import { generateKeyPairSync, sign } from 'node:crypto';
import type { ExecutionContext } from '@nestjs/common';
import { InternalServiceGuard } from './internal-service.guard';

describe('Production internal JWT authorization', () => {
  const original = { ...process.env };
  const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const headers = { authorization: '' };
  const context = {
    getHandler: () => function getLearningStructure() {},
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as ExecutionContext;
  const guard = new InternalServiceGuard();
  function token(extra: Record<string, unknown> = {}) {
    const now = Math.floor(Date.now() / 1000);
    const head = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString(
      'base64url',
    );
    const body = Buffer.from(
      JSON.stringify({
        iss: 'lms-internal',
        aud: 'course-service',
        sub: 'learning-service',
        scope: 'getLearningStructure',
        iat: now,
        exp: now + 300,
        ...extra,
      }),
    ).toString('base64url');
    return `Bearer ${head}.${body}.${sign('RSA-SHA256', Buffer.from(`${head}.${body}`), keys.privateKey).toString('base64url')}`;
  }
  beforeEach(() => {
    process.env.NODE_ENV = 'production';
    process.env.INTERNAL_JWT_PUBLIC_KEY = keys.publicKey
      .export({ format: 'pem', type: 'spki' })
      .toString();
    headers.authorization = token();
  });
  afterAll(() => {
    process.env = original;
  });
  it('accepts a scoped short-lived Learning token for Course', () => {
    expect(guard.canActivate(context)).toBe(true);
  });
  it.each([
    { aud: 'quiz-service' },
    { scope: 'checkEnrollment' },
    { sub: 'quiz-service' },
    { exp: Math.floor(Date.now() / 1000) + 600 },
    { iss: 'identity-service' },
  ])('rejects mismatched service claims %p', (claims) => {
    headers.authorization = token(claims);
    expect(() => guard.canActivate(context)).toThrow();
  });
});
