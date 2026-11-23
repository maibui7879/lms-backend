import { generateKeyPairSync, sign } from 'node:crypto';
import {
  ForbiddenException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  InternalServiceGuard,
  INTERNAL_SCOPE_KEY,
} from './internal-service.guard';

describe('InternalServiceGuard', () => {
  const originalEnv = { ...process.env };
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const handler = () => undefined;
  const request: { headers: Record<string, string | string[] | undefined> } = {
    headers: {},
  };
  const context = {
    getType: () => 'http',
    getHandler: () => handler,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  let operationId = 'getAttemptAccess';
  let reflector: Reflector;
  let guard: InternalServiceGuard;

  function token(
    overrides: Record<string, unknown> = {},
    key = privateKey,
  ): string {
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(
      JSON.stringify({ alg: 'RS256', typ: 'JWT' }),
    ).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        iss: 'lms-internal',
        aud: 'quiz-service',
        sub: 'learning-service',
        scope: operationId,
        iat: now,
        exp: now + 180,
        ...overrides,
      }),
    ).toString('base64url');
    const signature = sign(
      'RSA-SHA256',
      Buffer.from(`${header}.${payload}`),
      key,
    ).toString('base64url');
    return `${header}.${payload}.${signature}`;
  }

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    process.env.INTERNAL_JWT_PUBLIC_KEY = publicKey;
    operationId = 'getAttemptAccess';
    request.headers = { authorization: `Bearer ${token()}` };
    reflector = {
      get: jest.fn((key: string) =>
        key === INTERNAL_SCOPE_KEY ? operationId : undefined,
      ),
    } as unknown as Reflector;
    guard = new InternalServiceGuard(reflector);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('accepts a scoped, signed JWT from an allowed internal caller', () => {
    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects requests without an internal JWT', () => {
    request.headers = {};
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('fails closed when the verification key is not configured', () => {
    delete process.env.INTERNAL_JWT_PUBLIC_KEY;
    expect(() => guard.canActivate(context)).toThrow(
      ServiceUnavailableException,
    );
  });

  it('rejects an expired JWT', () => {
    request.headers.authorization = `Bearer ${token({ exp: 1 })}`;
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('rejects a JWT addressed to another service', () => {
    request.headers.authorization = `Bearer ${token({ aud: 'course-service' })}`;
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('rejects a valid JWT with the wrong operation scope', () => {
    request.headers.authorization = `Bearer ${token({ scope: 'getAssessmentSummary' })}`;
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('rejects callers not allowed for the operation', () => {
    request.headers.authorization = `Bearer ${token({ sub: 'course-service' })}`;
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('rejects operation scopes that are not declared in the Quiz contract', () => {
    operationId = 'notAQuizOperation';
    reflector = {
      get: jest.fn((key: string) =>
        key === INTERNAL_SCOPE_KEY ? operationId : undefined,
      ),
    } as unknown as Reflector;
    guard = new InternalServiceGuard(reflector);

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
