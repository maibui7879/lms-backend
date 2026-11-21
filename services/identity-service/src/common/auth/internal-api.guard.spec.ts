import { generateKeyPairSync, sign } from 'node:crypto';
import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { InternalApiGuard, INTERNAL_SCOPE_KEY } from './internal-api.guard';

describe('InternalApiGuard - Service-to-Service RS256 JWT & Strict Operation Scopes', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const { privateKey: foreignPrivateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const signInternalJwt = (
    overrides: Record<string, unknown> = {},
    keyPem: string = privateKey,
  ): string => {
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(
      JSON.stringify({ alg: 'RS256', typ: 'JWT' }),
    ).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        iss: 'lms-internal',
        aud: 'identity-service',
        sub: 'course-service',
        scope: 'getUserAccess',
        iat: now,
        exp: now + 180,
        ...overrides,
      }),
    ).toString('base64url');

    const signature = sign(
      'RSA-SHA256',
      Buffer.from(`${header}.${payload}`),
      keyPem,
    ).toString('base64url');

    return `${header}.${payload}.${signature}`;
  };

  const makeContext = (
    authHeader: string | undefined,
    handlerName: string,
    requiredScope?: string,
  ): { context: ExecutionContext; guard: InternalApiGuard } => {
    const configService = {
      get: jest.fn((key: string) =>
        key === 'INTERNAL_JWT_PUBLIC_KEY' ? publicKey : undefined,
      ),
    } as unknown as ConfigService;

    const reflector = {
      get: jest.fn((metaKey: string) =>
        metaKey === INTERNAL_SCOPE_KEY ? requiredScope : undefined,
      ),
    } as unknown as Reflector;

    const guard = new InternalApiGuard(configService, reflector);

    const handler = Object.defineProperty(() => undefined, 'name', {
      value: handlerName,
    });

    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: authHeader ? { authorization: authHeader } : {},
        }),
      }),
      getHandler: () => handler,
    } as unknown as ExecutionContext;

    return { context, guard };
  };

  it('allows valid RS256 token with exact getUserAccess scope', () => {
    const token = signInternalJwt({ scope: 'getUserAccess' });
    const { context, guard } = makeContext(
      `Bearer ${token}`,
      'getUserAccess',
      'getUserAccess',
    );
    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows valid RS256 token with exact getUserSummary scope', () => {
    const token = signInternalJwt({ scope: 'getUserSummary' });
    const { context, guard } = makeContext(
      `Bearer ${token}`,
      'getUserSummary',
      'getUserSummary',
    );
    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects wildcard scopes (*, internal, internal:users) with ForbiddenException', () => {
    for (const badScope of ['*', 'internal', 'internal:users']) {
      const token = signInternalJwt({ scope: badScope });
      const { context, guard } = makeContext(
        `Bearer ${token}`,
        'getUserSummary',
        'getUserSummary',
      );
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    }
  });

  it('rejects token when scope belongs to a different operation', () => {
    const token = signInternalJwt({ scope: 'getUserSummary' });
    const { context, guard } = makeContext(
      `Bearer ${token}`,
      'getUserAccess',
      'getUserAccess',
    );
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('rejects missing or non-Bearer Authorization header', () => {
    const { context: noHeaderCtx, guard: g1 } = makeContext(
      undefined,
      'getUserAccess',
      'getUserAccess',
    );
    expect(() => g1.canActivate(noHeaderCtx)).toThrow(UnauthorizedException);

    const { context: basicCtx, guard: g2 } = makeContext(
      'Basic abc123',
      'getUserAccess',
      'getUserAccess',
    );
    expect(() => g2.canActivate(basicCtx)).toThrow(UnauthorizedException);
  });

  it('rejects token signed with untrusted private key', () => {
    const token = signInternalJwt({ scope: 'getUserAccess' }, foreignPrivateKey);
    const { context, guard } = makeContext(
      `Bearer ${token}`,
      'getUserAccess',
      'getUserAccess',
    );
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('rejects token with wrong issuer or wrong audience', () => {
    const badIss = signInternalJwt({ iss: 'unknown-service' });
    const { context: c1, guard: g1 } = makeContext(
      `Bearer ${badIss}`,
      'getUserAccess',
      'getUserAccess',
    );
    expect(() => g1.canActivate(c1)).toThrow(UnauthorizedException);

    const badAud = signInternalJwt({ aud: 'course-service' });
    const { context: c2, guard: g2 } = makeContext(
      `Bearer ${badAud}`,
      'getUserAccess',
      'getUserAccess',
    );
    expect(() => g2.canActivate(c2)).toThrow(UnauthorizedException);
  });

  it('rejects expired token or token with TTL > 5 minutes (300s)', () => {
    const now = Math.floor(Date.now() / 1000);

    const expired = signInternalJwt({ iat: now - 400, exp: now - 10 });
    const { context: c1, guard: g1 } = makeContext(
      `Bearer ${expired}`,
      'getUserAccess',
      'getUserAccess',
    );
    expect(() => g1.canActivate(c1)).toThrow(UnauthorizedException);

    const tooLongTtl = signInternalJwt({ iat: now, exp: now + 600 });
    const { context: c2, guard: g2 } = makeContext(
      `Bearer ${tooLongTtl}`,
      'getUserAccess',
      'getUserAccess',
    );
    expect(() => g2.canActivate(c2)).toThrow(UnauthorizedException);
  });
});