import { Controller, Get, UseFilters, UseGuards } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CurrentUser } from '@lms/auth';
import type { AuthUser } from '@lms/contracts';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { generateKeyPairSync, sign } from 'node:crypto';
import request from 'supertest';
import { LearningAuthModule } from '../src/common/auth/learning-auth.module';
import { LearningAuthGuard } from '../src/common/auth/learning-auth.guard';
import { ApiExceptionFilter } from '../src/common/api-error';
import { IdentityClient } from '../src/integrations/identity.client';
import {
  bearerFor,
  identityKeys,
  serveIdentityAccess,
} from './fixtures/identity-auth';
import providers from './fixtures/learning-providers.mock.json';

@Controller('auth-probe')
@UseFilters(ApiExceptionFilter)
@UseGuards(LearningAuthGuard)
class AuthProbeController {
  @Get()
  get(@CurrentUser() user: AuthUser) {
    return { data: user };
  }
}

describe('Learning Identity JWT authentication', () => {
  let app: INestApplication;
  let mode = 'active';
  let accessChecks = 0;
  let receivedCredential = '';
  const identity = createServer((req, res) => {
    accessChecks += 1;
    receivedCredential = req.headers.authorization ?? '';
    if (mode === 'active') {
      serveIdentityAccess(req, res);
      return;
    }
    res.setHeader('Content-Type', 'application/json');
    if (mode === 'unavailable') return void res.writeHead(503).end('{}');
    if (mode === 'deleted') return void res.writeHead(404).end('{}');
    res.end(
      JSON.stringify({
        data: {
          userId:
            mode === 'wrong-user'
              ? providers.identity.studentA.id
              : providers.identity.studentB.id,
          role: mode === 'changed-role' ? 'INSTRUCTOR' : 'STUDENT',
          status: mode === 'inactive' ? 'INACTIVE' : 'ACTIVE',
        },
      }),
    );
  });
  const snapshot = { ...process.env };

  beforeAll(async () => {
    await new Promise<void>((resolve) =>
      identity.listen(0, '127.0.0.1', resolve),
    );
    process.env.IDENTITY_URL = `http://127.0.0.1:${(identity.address() as AddressInfo).port}`;
    const module = await Test.createTestingModule({
      imports: [LearningAuthModule],
      controllers: [AuthProbeController],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  beforeEach(() => {
    mode = 'active';
    accessChecks = 0;
    receivedCredential = '';
  });
  afterAll(async () => {
    await app?.close();
    identity.closeAllConnections();
    await new Promise<void>((resolve) => identity.close(() => resolve()));
    process.env = snapshot;
  });

  const get = () => request(app.getHttpServer()).get('/auth-probe');
  const authenticated = () => get().set('Authorization', bearerFor('studentB'));
  const invalidToken = (
    overrides: Record<string, unknown>,
    algorithm = 'RS256',
    wrongKey = false,
  ) => {
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: algorithm })).toString(
      'base64url',
    );
    const payload = Buffer.from(
      JSON.stringify({
        sub: providers.identity.studentB.id,
        email: providers.identity.studentB.email,
        role: 'STUDENT',
        iss: 'identity-service',
        iat: now,
        exp: now + 900,
        ...overrides,
      }),
    ).toString('base64url');
    const key = wrongKey
      ? generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey
      : identityKeys.privateKey;
    const input = `${header}.${payload}`;
    return `Bearer ${input}.${sign('RSA-SHA256', Buffer.from(input), key).toString('base64url')}`;
  };

  it('rejects fixture identity and role headers even when MOCK_AUTH is enabled', async () => {
    process.env.MOCK_AUTH = 'true';
    await get()
      .set('X-Mock-User', 'adminA')
      .set('X-User-Role', 'ADMIN')
      .expect(401);
    expect(accessChecks).toBe(0);
  });
  it('accepts a signed user token after the real Identity internal guard authorizes the service credential', async () => {
    const response = await authenticated()
      .set('X-Mock-User', 'adminA')
      .expect(200);
    expect(response.body.data).toMatchObject({
      id: providers.identity.studentB.id,
      role: 'STUDENT',
      status: 'ACTIVE',
    });
    expect(accessChecks).toBe(1);
    const claims = JSON.parse(
      Buffer.from(
        receivedCredential.slice(7).split('.')[1],
        'base64url',
      ).toString(),
    );
    expect(claims).toMatchObject({
      iss: 'lms-internal',
      sub: 'learning-service',
      aud: 'identity-service',
      scope: 'getUserAccess',
    });
    expect(claims.exp - claims.iat).toBe(240);
  });
  it.each([
    ['expired', { exp: 1 }],
    ['future-issued', { iat: Math.floor(Date.now() / 1000) + 3600 }],
    ['wrong issuer', { iss: 'other-service' }],
    ['invalid role', { role: 'SUPERADMIN' }],
  ])(
    'rejects %s tokens before contacting Identity',
    async (_label, overrides) => {
      await get().set('Authorization', invalidToken(overrides)).expect(401);
      expect(accessChecks).toBe(0);
    },
  );
  it('rejects a forged signature and an unexpected algorithm', async () => {
    await get()
      .set('Authorization', invalidToken({}, 'RS256', true))
      .expect(401);
    await get().set('Authorization', invalidToken({}, 'HS256')).expect(401);
    expect(accessChecks).toBe(0);
  });
  it.each([
    ['inactive', 403],
    ['changed-role', 403],
    ['deleted', 401],
    ['wrong-user', 503],
    ['unavailable', 503],
  ])(
    'handles Identity %s without granting access',
    async (scenario, expected) => {
      mode = scenario;
      await authenticated().expect(expected);
    },
  );
  it('fails closed when service signing is missing', async () => {
    const previous = process.env.IDENTITY_INTERNAL_JWT_PRIVATE_KEY;
    delete process.env.IDENTITY_INTERNAL_JWT_PRIVATE_KEY;
    try {
      await authenticated().expect(503);
      expect(accessChecks).toBe(0);
    } finally {
      process.env.IDENTITY_INTERNAL_JWT_PRIVATE_KEY = previous;
    }
  });
  it('fails closed for an invalid configured user verification key', async () => {
    const previous = process.env.JWT_PUBLIC_KEY;
    process.env.JWT_PUBLIC_KEY = 'invalid';
    try {
      await authenticated().expect(503);
      expect(accessChecks).toBe(0);
    } finally {
      process.env.JWT_PUBLIC_KEY = previous;
    }
  });
  it('fails closed when Identity cannot be reached', async () => {
    const previous = process.env.IDENTITY_URL;
    process.env.IDENTITY_URL = 'http://127.0.0.1:1';
    try {
      await authenticated().expect(503);
    } finally {
      process.env.IDENTITY_URL = previous;
    }
  });
  it('signs a different narrow service credential on each request', async () => {
    const client = new IdentityClient();
    await client.accessStatus(providers.identity.studentB.id);
    const first = receivedCredential;
    await client.accessStatus(providers.identity.studentB.id);
    expect(receivedCredential).not.toBe(first);
  });
});
