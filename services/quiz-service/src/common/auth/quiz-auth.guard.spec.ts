import { generateKeyPairSync, sign } from 'node:crypto';
import type { ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest } from '@lms/auth';
import { QuizAuthGuard } from './quiz-auth.guard';

describe('QuizAuthGuard', () => {
  const originalEnv = { ...process.env };
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const userId = '11111111-1111-4111-8111-111111111111';
  const request: AuthenticatedRequest = { headers: {} };
  const context = {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  const guard = new QuizAuthGuard();
  const fetchMock = jest.fn();
  const originalFetch = global.fetch;

  function token(overrides: Record<string, unknown> = {}, algorithm = 'RS256') {
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: algorithm })).toString(
      'base64url',
    );
    const payload = Buffer.from(
      JSON.stringify({
        sub: userId,
        email: 'student@example.test',
        role: 'STUDENT',
        iss: 'identity-service',
        iat: now,
        exp: now + 900,
        ...overrides,
      }),
    ).toString('base64url');
    const signature = sign(
      'RSA-SHA256',
      Buffer.from(`${header}.${payload}`),
      privateKey,
    ).toString('base64url');
    return `${header}.${payload}.${signature}`;
  }

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    process.env.MOCK_AUTH = 'false';
    process.env.JWT_PUBLIC_KEY = publicKey;
    process.env.IDENTITY_URL = 'http://identity.test';
    process.env.IDENTITY_SERVICE_TOKEN = 'test-service-token';
    request.headers = { authorization: `Bearer ${token()}` };
    delete request.user;
    fetchMock.mockReset().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { userId, role: 'STUDENT', status: 'ACTIVE' },
      }),
    });
    global.fetch = fetchMock;
  });

  afterAll(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  it('accepts a signed user token after checking current Identity access', async () => {
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual({
      id: userId,
      email: 'student@example.test',
      role: 'STUDENT',
      status: 'ACTIVE',
    });
    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      `http://identity.test/api/v1/internal/users/${userId}/access`,
    );
    expect(options.headers).toEqual({
      Authorization: 'Bearer test-service-token',
    });
    expect(options.redirect).toBe('error');
  });

  it('rejects JWT algorithms other than RS256', async () => {
    request.headers.authorization = `Bearer ${token({}, 'HS256')}`;
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: 401,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects expired tokens before contacting Identity', async () => {
    request.headers.authorization = `Bearer ${token({ exp: 1 })}`;
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: 401,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a token when the current Identity role has changed', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { userId, role: 'INSTRUCTOR', status: 'ACTIVE' },
      }),
    });
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: 403,
    });
    expect(request.user).toBeUndefined();
  });

  it('fails closed when Identity cannot be reached', async () => {
    fetchMock.mockRejectedValue(new Error('Identity unavailable'));
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: 503,
    });
    expect(request.user).toBeUndefined();
  });

  it('allows fixture auth only in development or test', async () => {
    process.env.MOCK_AUTH = 'true';
    request.headers = { 'x-mock-user': 'instructorA' };

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user?.role).toBe('INSTRUCTOR');
    expect(fetchMock).not.toHaveBeenCalled();

    process.env.NODE_ENV = 'production';
    delete request.user;
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: 401,
    });
    expect(request.user).toBeUndefined();
  });
});
