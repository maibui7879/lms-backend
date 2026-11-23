import { generateKeyPairSync, sign, verify } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getMockUser } from '@lms/auth';
import type { MockUserName } from '@lms/auth';
import ids from '@lms/contracts/fixtures/ids.json';
import { InternalApiGuard } from '../../../identity-service/src/common/auth/internal-api.guard';

export const identityKeys = generateKeyPairSync('rsa', { modulusLength: 2048 });
export const serviceKeys = generateKeyPairSync('rsa', { modulusLength: 2048 });

export function bearerFor(actor: string): string {
  const user = getMockUser(actor as MockUserName);
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(
    JSON.stringify({ alg: 'RS256', typ: 'JWT' }),
  ).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      sub: user.id,
      email: user.email,
      role: user.role,
      iss: 'identity-service',
      iat: now,
      exp: now + 900,
    }),
  ).toString('base64url');
  const input = `${header}.${payload}`;
  return `Bearer ${input}.${sign('RSA-SHA256', Buffer.from(input), identityKeys.privateKey).toString('base64url')}`;
}

export function fixtureActor(request: IncomingMessage): string | undefined {
  const token = request.headers.authorization?.slice(7);
  if (!token) return undefined;
  try {
    const [header, payload, signature] = token.split('.');
    if (
      !verify(
        'RSA-SHA256',
        Buffer.from(`${header}.${payload}`),
        identityKeys.publicKey,
        Buffer.from(signature, 'base64url'),
      )
    )
      return undefined;
    const { sub } = JSON.parse(
      Buffer.from(payload, 'base64url').toString(),
    ) as { sub: string };
    return Object.keys(ids.users).find(
      (name) => ids.users[name as MockUserName] === sub,
    );
  } catch {
    return undefined;
  }
}

export function serveIdentityAccess(
  request: IncomingMessage,
  response: ServerResponse,
): boolean {
  const match = /^\/api\/v1\/internal\/users\/([^/]+)\/access$/.exec(
    new URL(request.url!, 'http://fixture').pathname,
  );
  if (!match) return false;
  const guard = new InternalApiGuard(
    new ConfigService({
      INTERNAL_JWT_PUBLIC_KEY: serviceKeys.publicKey
        .export({ type: 'spki', format: 'pem' })
        .toString(),
    }),
  );
  const context = {
    getHandler: () => ({ name: 'getUserAccess' }),
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  guard.canActivate(context);
  const name = Object.keys(ids.users).find(
    (name) => ids.users[name as MockUserName] === match[1],
  );
  response.setHeader('Content-Type', 'application/json');
  if (!name) {
    response
      .writeHead(404)
      .end(JSON.stringify({ error: { code: 'NOT_FOUND' } }));
    return true;
  }
  const { id, role, status } = getMockUser(name as MockUserName);
  response.end(JSON.stringify({ data: { userId: id, role, status } }));
  return true;
}
