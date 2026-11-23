import { ServiceUnavailableException } from '@nestjs/common';
import { createPrivateKey, randomUUID, sign } from 'node:crypto';

/** Fresh, narrowly scoped service token for each Identity access check. */
export function createIdentityServiceToken(): string {
  const pem = process.env.IDENTITY_INTERNAL_JWT_PRIVATE_KEY?.replace(
    /\\n/g,
    '\n',
  );
  if (!pem)
    throw new ServiceUnavailableException(
      'Identity service JWT signing is not configured',
    );
  try {
    const key = createPrivateKey(pem);
    if (key.asymmetricKeyType !== 'rsa') throw new Error('RSA key required');
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(
      JSON.stringify({ alg: 'RS256', typ: 'JWT' }),
    ).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        iss: 'lms-internal',
        sub: 'notification-service',
        aud: 'identity-service',
        scope: 'getUserAccess',
        iat: now,
        exp: now + 240,
        jti: randomUUID(),
      }),
    ).toString('base64url');
    const input = `${header}.${payload}`;
    return `${input}.${sign('RSA-SHA256', Buffer.from(input), key).toString('base64url')}`;
  } catch {
    throw new ServiceUnavailableException(
      'Identity service JWT signing key is invalid',
    );
  }
}
