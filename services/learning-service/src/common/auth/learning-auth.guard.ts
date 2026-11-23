import { Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest } from '@lms/auth';
import { parseContract } from '@lms/contracts';
import { createPublicKey, verify } from 'node:crypto';
import { IdentityClient } from '../../integrations/identity.client';
import { apiError } from '../api-error';

@Injectable()
export class LearningAuthGuard implements CanActivate {
  constructor(private readonly identity: IdentityClient) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    delete request.user;
    const authorization = request.headers.authorization;
    if (
      typeof authorization !== 'string' ||
      !/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/i.test(
        authorization,
      )
    )
      throw apiError('UNAUTHORIZED', 'A Bearer access token is required');

    const pem = process.env.JWT_PUBLIC_KEY?.replace(/\\n/g, '\n');
    if (!pem)
      throw apiError(
        'SERVICE_UNAVAILABLE',
        'Identity public key is not configured',
      );
    let key: ReturnType<typeof createPublicKey>;
    try {
      key = createPublicKey(pem);
      if (key.asymmetricKeyType !== 'rsa') throw new Error('RSA key required');
    } catch {
      throw apiError('SERVICE_UNAVAILABLE', 'Identity public key is invalid');
    }

    const [header, payload, signature] = authorization.slice(7).split('.');
    let claims;
    try {
      const metadata = JSON.parse(
        Buffer.from(header, 'base64url').toString(),
      ) as {
        alg?: string;
      };
      if (
        metadata.alg !== 'RS256' ||
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
        claims.iss !== (process.env.JWT_ISSUER ?? 'identity-service') ||
        !Number.isSafeInteger(claims.iat) ||
        !Number.isSafeInteger(claims.exp) ||
        claims.iat > now ||
        claims.exp <= now ||
        claims.exp <= claims.iat
      )
        throw new Error('Invalid token claims');
    } catch {
      throw apiError('UNAUTHORIZED', 'Access token is invalid or expired');
    }

    const requestId = request.headers['x-request-id'];
    const access = await this.identity.accessStatus(
      claims.sub,
      typeof requestId === 'string' ? requestId : undefined,
    );
    if (access.status !== 'ACTIVE' || access.role !== claims.role)
      throw apiError(
        'FORBIDDEN',
        'Account is inactive or its role has changed',
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
