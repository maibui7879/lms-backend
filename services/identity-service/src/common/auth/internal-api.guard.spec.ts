import { generateKeyPairSync, sign } from 'node:crypto';
import type { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InternalApiGuard } from './internal-api.guard';

describe('InternalApiGuard', () => {
  const originalEnv = { ...process.env };
  const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const otherKeys = generateKeyPairSync('rsa', { modulusLength: 2048 });

  let headers: Record<string, string | undefined> = {};
  let currentHandlerName = 'getUserSummary';

  const mockContext = {
    getHandler: () => ({ name: currentHandlerName }),
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
  } as unknown as ExecutionContext;

  const configService = {
    get: (key: string) => process.env[key],
  } as ConfigService;

  const guard = new InternalApiGuard(configService);

  function createToken(extra: Record<string, unknown> = {}, signKey = keys.privateKey) {
    const now = Math.floor(Date.now() / 1000);
    const head = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url');
    const body = Buffer.from(
      JSON.stringify({
        iss: 'lms-internal',
        aud: 'identity-service',
        sub: 'course-service',
        scope: 'getUserSummary',
        iat: now,
        exp: now + 300,
        ...extra,
      }),
    ).toString('base64url');
    const signature = sign('RSA-SHA256', Buffer.from(`${head}.${body}`), signKey).toString('base64url');
    return `Bearer ${head}.${body}.${signature}`;
  }

  beforeEach(() => {
    process.env.NODE_ENV = 'production';
    delete process.env.IDENTITY_SERVICE_TOKEN;
    process.env.INTERNAL_JWT_PUBLIC_KEY = keys.publicKey
      .export({ format: 'pem', type: 'spki' })
      .toString();
    currentHandlerName = 'getUserSummary';
    headers = { authorization: createToken() };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('accepts a valid internal Service JWT for getUserSummary', () => {
    expect(guard.canActivate(mockContext)).toBe(true);
  });

  it('accepts a valid internal Service JWT for getUserAccess with corresponding scope', () => {
    currentHandlerName = 'getUserAccess';
    headers.authorization = createToken({ scope: 'getUserAccess' });
    expect(guard.canActivate(mockContext)).toBe(true);
  });

  it('rejects request when Authorization header is missing', () => {
    headers = {};
    expect(() => guard.canActivate(mockContext)).toThrow('Authorization header with Bearer token is required');
  });

  it('rejects request with non-Bearer authorization scheme', () => {
    headers.authorization = 'Basic dXNlcjpwYXNz';
    expect(() => guard.canActivate(mockContext)).toThrow('Authorization header with Bearer token is required');
  });

  it('rejects malformed token string', () => {
    headers.authorization = 'Bearer not.a.valid.jwt';
    expect(() => guard.canActivate(mockContext)).toThrow('Invalid internal JWT');
  });

  it('rejects token signed by an untrusted key', () => {
    headers.authorization = createToken({}, otherKeys.privateKey);
    expect(() => guard.canActivate(mockContext)).toThrow('Invalid internal JWT');
  });

  it('rejects mismatched audience', () => {
    headers.authorization = createToken({ aud: 'course-service' });
    expect(() => guard.canActivate(mockContext)).toThrow('Invalid internal JWT');
  });

  it('rejects untrusted issuer', () => {
    headers.authorization = createToken({ iss: 'untrusted-issuer' });
    expect(() => guard.canActivate(mockContext)).toThrow('Invalid internal JWT');
  });

  it('rejects insufficient scope for handler', () => {
    currentHandlerName = 'getUserAccess';
    headers.authorization = createToken({ scope: 'otherScope' });
    expect(() => guard.canActivate(mockContext)).toThrow('Invalid internal JWT');
  });

  it('rejects token with TTL exceeding 5 minutes (300 seconds)', () => {
    const now = Math.floor(Date.now() / 1000);
    headers.authorization = createToken({ exp: now + 301 });
    expect(() => guard.canActivate(mockContext)).toThrow('Invalid internal JWT');
  });

  it('rejects expired token', () => {
    const now = Math.floor(Date.now() / 1000);
    headers.authorization = createToken({ iat: now - 400, exp: now - 100 });
    expect(() => guard.canActivate(mockContext)).toThrow('Invalid internal JWT');
  });

  it('allows IDENTITY_SERVICE_TOKEN in test/development when configured', () => {
    process.env.NODE_ENV = 'test';
    process.env.IDENTITY_SERVICE_TOKEN = 'secret-dev-token';
    headers.authorization = 'Bearer secret-dev-token';
    expect(guard.canActivate(mockContext)).toBe(true);
  });
});
