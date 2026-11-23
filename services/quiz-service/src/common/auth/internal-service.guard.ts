import { createPublicKey, verify } from 'node:crypto';
import {
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ENDPOINTS } from '@lms/contracts';

export const INTERNAL_SCOPE_KEY = 'quiz_internal_scope';

export function InternalScope(operationId: string): MethodDecorator {
  return SetMetadata(INTERNAL_SCOPE_KEY, operationId);
}

interface InternalJwtClaims {
  iss?: unknown;
  sub?: unknown;
  aud?: unknown;
  scope?: unknown;
  iat?: unknown;
  exp?: unknown;
}

const internalOperations = new Set(
  ENDPOINTS.filter(
    (endpoint) => endpoint.service === 'quiz' && endpoint.access === 'INTERNAL',
  ).map((endpoint) => endpoint.operationId),
);

const allowedCallers: Record<string, readonly string[]> = {
  getAssessmentSummary: ['learning-service'],
  getAttemptAccess: ['learning-service'],
  getQuizRecommendationContext: ['learning-service'],
  getLearnerAssessments: ['course-service', 'api-gateway'],
};

@Injectable()
export class InternalServiceGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http')
      throw new UnauthorizedException('Internal HTTP JWT required');

    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
    }>();
    const authorization = request.headers.authorization;
    if (
      typeof authorization !== 'string' ||
      !/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(
        authorization,
      )
    )
      throw new UnauthorizedException('Internal JWT required');

    const publicKey = process.env.INTERNAL_JWT_PUBLIC_KEY?.replace(
      /\\n/g,
      '\n',
    );
    if (!publicKey)
      throw new ServiceUnavailableException(
        'Internal JWT verification is not configured',
      );

    const operationId = this.reflector.get<string>(
      INTERNAL_SCOPE_KEY,
      context.getHandler(),
    );
    if (
      !operationId ||
      !internalOperations.has(operationId) ||
      !allowedCallers[operationId]
    )
      throw new ForbiddenException('Internal operation scope is not configured');

    let claims: InternalJwtClaims;
    try {
      const [header, payload, signature] = authorization.slice(7).split('.');
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
        throw new Error('Invalid internal JWT signature');

      const decoded = JSON.parse(
        Buffer.from(payload, 'base64url').toString(),
      ) as unknown;
      if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded))
        throw new Error('Invalid internal JWT payload');
      claims = decoded as InternalJwtClaims;

      const now = Math.floor(Date.now() / 1000);
      const audiences =
        typeof claims.aud === 'string'
          ? [claims.aud]
          : Array.isArray(claims.aud)
            ? claims.aud
            : [];
      if (
        claims.iss !== 'lms-internal' ||
        !audiences.includes('quiz-service') ||
        typeof claims.iat !== 'number' ||
        typeof claims.exp !== 'number' ||
        !Number.isSafeInteger(claims.iat) ||
        !Number.isSafeInteger(claims.exp) ||
        claims.iat > now ||
        claims.exp <= now ||
        claims.exp <= claims.iat ||
        claims.exp - claims.iat > 300
      )
        throw new Error('Invalid internal JWT claims');
    } catch {
      throw new UnauthorizedException(
        'Invalid internal JWT, issuer, audience or lifetime',
      );
    }

    const scopes =
      typeof claims.scope === 'string'
        ? claims.scope.split(/[\s,]+/).filter(Boolean)
        : Array.isArray(claims.scope)
          ? claims.scope.filter(
              (scope): scope is string => typeof scope === 'string',
            )
          : [];
    if (
      typeof claims.sub !== 'string' ||
      !allowedCallers[operationId].includes(claims.sub) ||
      !scopes.includes(operationId)
    )
      throw new ForbiddenException(
        'Internal caller is not allowed for this operation',
      );

    return true;
  }
}
