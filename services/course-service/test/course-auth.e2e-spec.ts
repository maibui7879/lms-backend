import { generateKeyPairSync, sign } from 'node:crypto';
import { CourseAuthGuard } from '../src/common/course-auth.guard';
import type { ExecutionContext } from '@nestjs/common';

describe('Course RS256 authentication', () => {
  const originalEnv = { ...process.env };
  const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
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
    process.env.IDENTITY_SERVICE_TOKEN = 'test-service-token';
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
