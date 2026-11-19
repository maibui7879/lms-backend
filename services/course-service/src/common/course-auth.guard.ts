import {
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { MockAuthGuard } from '@lms/auth';
import type { AuthenticatedRequest } from '@lms/auth';
import { parseContract } from '@lms/contracts';
import { createPublicKey, verify } from 'node:crypto';

/** Mock identities are accepted only when explicitly enabled for local/test. */
@Injectable()
export class CourseAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (process.env.MOCK_AUTH === 'true')
      return new MockAuthGuard().canActivate(context);
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    delete request.user;
    const token = request.headers.authorization;
    if (
      typeof token !== 'string' ||
      !/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)
    )
      throw new UnauthorizedException('Bearer token required');
    const publicKey = process.env.JWT_PUBLIC_KEY?.replace(/\\n/g, '\n');
    const identityUrl = process.env.IDENTITY_URL;
    const credential = process.env.IDENTITY_SERVICE_TOKEN;
    if (!publicKey || !identityUrl || !credential)
      throw new ServiceUnavailableException(
        'Identity authentication is not configured',
      );
    const [header, payload, signature] = token.slice(7).split('.');
    let claims;
    try {
      const metadata = JSON.parse(
        Buffer.from(header, 'base64url').toString(),
      ) as { alg?: string };
      const key = createPublicKey(publicKey);
      if (
        metadata.alg !== 'RS256' ||
        key.asymmetricKeyType !== 'rsa' ||
        !verify(
          'RSA-SHA256',
          Buffer.from(`${header}.${payload}`),
          key,
          Buffer.from(signature, 'base64url'),
        )
      )
        throw new Error('Invalid signature');
      claims = parseContract(
        'JwtClaims',
        JSON.parse(Buffer.from(payload, 'base64url').toString()),
      );
      const now = Math.floor(Date.now() / 1000);
      if (
        claims.iss !== 'identity-service' ||
        claims.exp <= now ||
        claims.iat > now ||
        claims.exp <= claims.iat
      )
        throw new Error('Invalid token claims');
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
    let access;
    try {
      const response = await fetch(
        new URL(`/api/v1/internal/users/${claims.sub}/access`, identityUrl),
        {
          headers: { Authorization: `Bearer ${credential}` },
          signal: AbortSignal.timeout(3000),
          redirect: 'error',
        },
      );
      if (!response.ok) throw new Error('Identity unavailable');
      const body = (await response.json()) as { data?: unknown };
      access = parseContract('UserAccessStatus', body.data);
      if (access.userId !== claims.sub) throw new Error('Unexpected identity');
    } catch {
      throw new ServiceUnavailableException(
        'Identity access check unavailable',
      );
    }
    if (access.status !== 'ACTIVE' || access.role !== claims.role)
      throw new ForbiddenException(
        'Account is inactive or token permissions have changed',
      );
    request.user = {
      id: claims.sub,
      email: claims.email,
      role: access.role,
      status: access.status,
    };
    return true;
  }
}
