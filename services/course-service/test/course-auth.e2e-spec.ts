import { generateKeyPairSync, sign, verify } from 'node:crypto';
import { CourseAuthGuard } from '../src/common/course-auth.guard';
import type { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InternalApiGuard } from '../../identity-service/src/common/auth/internal-api.guard';

describe('Course RS256 authentication', () => {
  const originalEnv = { ...process.env };
  const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const serviceKeys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const userId = '11111111-1111-4111-8111-111111111111';
  const request: { headers: Record<string, string>; user?: unknown } = {
    headers: {},
  };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as ExecutionContext;
  const guard = new CourseAuthGuard();
  const fetchMock = jest.fn();
  const originalFetch = global.fetch;

  function token(extra: Record<string, unknown> = {}, algorithm = 'RS256') {
    const now = Math.floor(Date.now() / 1000);
    const head = Buffer.from(JSON.stringify({ alg: algorithm })).toString(
      'base64url',
    );
    const body = Buffer.from(
      JSON.stringify({
        sub: userId,
        email: 'student@example.test',
        role: 'STUDENT',
        iss: 'identity-service',
        iat: now,
        exp: now + 900,
        ...extra,
      }),
    ).toString('base64url');
    return `${head}.${body}.${sign('RSA-SHA256', Buffer.from(`${head}.${body}`), keys.privateKey).toString('base64url')}`;
  }

  beforeEach(() => {
    process.env.MOCK_AUTH = 'false';
    process.env.JWT_PUBLIC_KEY = keys.publicKey
      .export({ type: 'spki', format: 'pem' })
      .toString();
    process.env.IDENTITY_URL = 'http://identity.test';
    process.env.IDENTITY_INTERNAL_JWT_PRIVATE_KEY = serviceKeys.privateKey
      .export({ type: 'pkcs8', format: 'pem' })
      .toString();
    request.headers = { authorization: `Bearer ${token()}` };
    delete request.user;
    fetchMock.mockReset().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          userId,
          role: 'STUDENT',
          status: 'ACTIVE',
        },
      }),
    });
    global.fetch = fetchMock;
  });
  afterAll(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  it('accepts a signed token only after checking current Identity access', async () => {
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toMatchObject({ id: userId, status: 'ACTIVE' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('signs a fresh short-lived Identity-only service credential for every check', async () => {
    await guard.canActivate(context);
    await guard.canActivate(context);
    const credentials = fetchMock.mock.calls.map(([, options]) =>
      (options.headers.Authorization as string).slice(7),
    );
    expect(credentials[0]).not.toBe(credentials[1]);
    for (const credential of credentials) {
      const [head, body, signature] = credential.split('.');
      expect(
        verify(
          'RSA-SHA256',
          Buffer.from(`${head}.${body}`),
          serviceKeys.publicKey,
          Buffer.from(signature, 'base64url'),
        ),
      ).toBe(true);
      const claims = JSON.parse(Buffer.from(body, 'base64url').toString());
      expect(claims).toMatchObject({
        iss: 'lms-internal',
        sub: 'course-service',
        aud: 'identity-service',
        scope: 'getUserAccess',
      });
      expect(claims.exp - claims.iat).toBe(240);
      expect(claims.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    }
  });
  it('produces a credential accepted by the actual Identity internal guard', async () => {
    const identityGuard = new InternalApiGuard(
      new ConfigService({
        INTERNAL_JWT_PUBLIC_KEY: serviceKeys.publicKey
          .export({ type: 'spki', format: 'pem' })
          .toString(),
      }),
    );
    fetchMock.mockImplementation(async (_url, options) => {
      const internalContext = {
        getHandler: () => ({ name: 'getUserAccess' }),
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              authorization: options.headers.Authorization,
            },
          }),
        }),
      } as unknown as ExecutionContext;
      expect(identityGuard.canActivate(internalContext)).toBe(true);
      return {
        ok: true,
        json: async () => ({
          data: { userId, role: 'STUDENT', status: 'ACTIVE' },
        }),
      };
    });
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
  it('fails closed without a service signing key, even with a legacy static token', async () => {
    delete process.env.IDENTITY_INTERNAL_JWT_PRIVATE_KEY;
    process.env.IDENTITY_SERVICE_TOKEN = 'legacy-token';
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: 503,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('fails closed with an invalid signing key', async () => {
    process.env.IDENTITY_INTERNAL_JWT_PRIVATE_KEY = 'invalid';
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: 503,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('rejects inactive accounts', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { userId, role: 'STUDENT', status: 'INACTIVE' },
      }),
    });
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: 403,
    });
    expect(request.user).toBeUndefined();
  });
  it('rejects expired tokens before contacting Identity', async () => {
    request.headers.authorization = `Bearer ${token({ exp: 1 })}`;
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: 401,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('does not accept a JWT declaring another algorithm', async () => {
    request.headers.authorization = `Bearer ${token({}, 'HS256')}`;
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: 401,
    });
  });
  it('rejects a role changed since the token was issued', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          userId,
          role: 'INSTRUCTOR',
          status: 'ACTIVE',
        },
      }),
    });
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: 403,
    });
    expect(request.user).toBeUndefined();
  });
  it('fails closed when Identity cannot be reached', async () => {
    fetchMock.mockRejectedValue(new Error('unavailable'));
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: 503,
    });
    expect(request.user).toBeUndefined();
  });
});
