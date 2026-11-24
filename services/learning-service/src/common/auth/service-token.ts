import { createPrivateKey, randomUUID, sign } from 'node:crypto';
import { apiError } from '../api-error';

export function createServiceToken(
  target: 'identity' | 'course',
  scope:
    | 'getUserAccess'
    | 'getUserSummary'
    | 'getLearningStructure'
    | 'getCourseItemMigrationContext',
): string {
  const variable =
    target === 'identity'
      ? 'IDENTITY_INTERNAL_JWT_PRIVATE_KEY'
      : 'COURSE_INTERNAL_JWT_PRIVATE_KEY';
  const pem = process.env[variable]?.replace(/\\n/g, '\n');
  if (!pem)
    throw apiError(
      'SERVICE_UNAVAILABLE',
      `${target} service signing key is not configured`,
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
        sub: 'learning-service',
        aud: `${target}-service`,
        scope,
        iat: now,
        exp: now + 240,
        jti: randomUUID(),
      }),
    ).toString('base64url');
    const input = `${header}.${payload}`;
    return `${input}.${sign('RSA-SHA256', Buffer.from(input), key).toString('base64url')}`;
  } catch {
    throw apiError(
      'SERVICE_UNAVAILABLE',
      `${target} service signing key is invalid`,
    );
  }
}
