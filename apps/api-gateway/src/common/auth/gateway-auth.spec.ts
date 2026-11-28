import { generateKeyPairSync, sign } from 'node:crypto';
import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { authorizeGateway } from './gateway-auth';

const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });

const forgedKeys = generateKeyPairSync('rsa', { modulusLength: 2048 });

const publicKey = keys.publicKey
  .export({ type: 'spki', format: 'pem' })
  .toString();

describe('authorizeGateway', () => {
  let original: string | undefined;
  beforeEach(() => {
    original = process.env.JWT_PUBLIC_KEY;
    process.env.JWT_PUBLIC_KEY = publicKey;
  });
  afterEach(() => {
    if (original === undefined) delete process.env.JWT_PUBLIC_KEY;
    else process.env.JWT_PUBLIC_KEY = original;
  });
  const token = (
    overrides: Record<string, unknown> = {},
    privateKey = keys.privateKey,
    algorithm = 'RS256',
  ) => {
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(
      JSON.stringify({ alg: algorithm, typ: 'JWT' }),
    ).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        sub: '11111111-1111-4111-8111-111111111111',
        email: 'student@example.com',
        role: 'STUDENT',
        iss: 'identity-service',
        iat: now,
        exp: now + 300,
        ...overrides,
      }),
    ).toString('base64url');
    const body = `${header}.${payload}`;
    return `Bearer ${body}.${sign('RSA-SHA256', Buffer.from(body), privateKey).toString('base64url')}`;
  };

  it('accepts a signed contract JWT without role business enforcement', () => {
    for (const role of ['STUDENT', 'INSTRUCTOR', 'ADMIN'])
      expect(() => authorizeGateway(token({ role }))).not.toThrow();
  });
  it.each([undefined, '', 'Basic abc', 'Bearer malformed', 'Bearer a.b.c'])(
    'rejects missing or malformed authorization %s',
    (value) => {
      expect(() => authorizeGateway(value)).toThrow(UnauthorizedException);
    },
  );
  it.each([
    { exp: 1 },
    { iss: 'other-service' },
    { iat: 1.5 },
    { exp: 9999999999.5 },
    { role: 'OWNER' },
    { email: 'invalid' },
    { exp: undefined },
  ])('rejects invalid claims %j', (claims) => {
    expect(() => authorizeGateway(token(claims))).toThrow(
      UnauthorizedException,
    );
  });
  it('rejects a forged signature and algorithms outside RS256', () => {
    expect(() => authorizeGateway(token({}, forgedKeys.privateKey))).toThrow(
      UnauthorizedException,
    );
    expect(() => authorizeGateway(token({}, keys.privateKey, 'HS256'))).toThrow(
      UnauthorizedException,
    );
  });
  it('rejects future issuance and expiry at or before issuance', () => {
    const now = 1800000000;
    const clock = jest.spyOn(Date, 'now').mockReturnValue(now * 1000);
    try {
      for (const claims of [
        { iat: now + 1, exp: now + 300 },
        { iat: now, exp: now },
        { iat: now, exp: now - 1 },
      ]) {
        expect(() => authorizeGateway(token(claims))).toThrow(
          UnauthorizedException,
        );
      }
      expect(() =>
        authorizeGateway(token({ iat: now, exp: now + 1 })),
      ).not.toThrow();
    } finally {
      clock.mockRestore();
    }
  });
  it.each([undefined, '', 'Basic abc', 'Bearer malformed'])(
    'returns 401 before checking missing key for authorization %s',
    (authorization) => {
      delete process.env.JWT_PUBLIC_KEY;
      expect(() => authorizeGateway(authorization)).toThrow(
        UnauthorizedException,
      );
    },
  );
  it.each([undefined, '', 'invalid key'])(
    'fails closed for missing or invalid configuration',
    (value) => {
      if (value === undefined) delete process.env.JWT_PUBLIC_KEY;
      else process.env.JWT_PUBLIC_KEY = value;
      expect(() => authorizeGateway(token())).toThrow(
        ServiceUnavailableException,
      );
    },
  );
});
