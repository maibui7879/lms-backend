import { createPublicKey, verify } from 'node:crypto';
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Optional,
  ServiceUnavailableException,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

export const INTERNAL_SCOPE_KEY = 'internal_scope';
export const InternalScope = (scope: string) =>
  SetMetadata(INTERNAL_SCOPE_KEY, scope);

const ALLOWED_CALLERS_BY_SCOPE: Record<string, string[]> = {
  getUserSummary: [
    'api-gateway',
    'course-service',
    'quiz-service',
    'learning-service',
    'identity-service',
    'assessment-service',
  ],
  getUserAccess: [
    'api-gateway',
    'course-service',
    'quiz-service',
    'learning-service',
    'identity-service',
    'assessment-service',
  ],
};

@Injectable()
export class InternalApiGuard implements CanActivate {
  constructor(
    private readonly configService: ConfigService,
    @Optional() private readonly reflector?: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const authorization = req.headers.authorization;

    if (
      typeof authorization !== 'string' ||
      !authorization.startsWith('Bearer ')
    ) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Authorization header with Bearer token is required',
      });
    }

    const token = authorization.slice(7).trim();
    if (!token) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Bearer token is missing',
      });
    }

    return this.verifyServiceJwt(token, context);
  }

  private verifyServiceJwt(token: string, context: ExecutionContext): boolean {
    const rawPublicKey =
      this.configService.get<string>('INTERNAL_JWT_PUBLIC_KEY') ||
      process.env.INTERNAL_JWT_PUBLIC_KEY ||
      this.configService.get<string>('JWT_PUBLIC_KEY') ||
      process.env.JWT_PUBLIC_KEY;

    const publicKeyPem = rawPublicKey?.replace(/\\n/g, '\n');
    if (!publicKeyPem) {
      throw new ServiceUnavailableException({
        code: 'SERVICE_UNAVAILABLE',
        message: 'Internal JWT verification is not configured',
      });
    }

    let claims: Record<string, unknown>;
    try {
      if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) {
        throw new Error('Invalid JWT format');
      }

      const [head, body, signature] = token.split('.');
      const metadata = JSON.parse(
        Buffer.from(head, 'base64url').toString(),
      ) as { alg?: string };

      if (metadata.alg !== 'RS256') {
        throw new Error('Algorithm not allowed');
      }

      const key = createPublicKey(publicKeyPem);
      if (key.asymmetricKeyType !== 'rsa') {
        throw new Error('Invalid key type');
      }

      const isValid = verify(
        'RSA-SHA256',
        Buffer.from(`${head}.${body}`),
        key,
        Buffer.from(signature, 'base64url'),
      );
      if (!isValid) {
        throw new Error('Invalid signature');
      }

      claims = JSON.parse(Buffer.from(body, 'base64url').toString()) as Record<
        string,
        unknown
      >;

      const now = Math.floor(Date.now() / 1000);

      if (
        typeof claims.iat !== 'number' ||
        typeof claims.exp !== 'number' ||
        !Number.isSafeInteger(claims.iat) ||
        !Number.isSafeInteger(claims.exp) ||
        claims.iat > now ||
        claims.exp <= now ||
        claims.exp <= claims.iat ||
        claims.exp - claims.iat > 300
      ) {
        throw new Error('Invalid or expired time claims');
      }

      if (claims.iss !== 'lms-internal') {
        throw new Error('Invalid issuer');
      }

      const audiences = Array.isArray(claims.aud)
        ? claims.aud
        : typeof claims.aud === 'string'
          ? [claims.aud]
          : [];
      if (!audiences.includes('identity-service')) {
        throw new Error('Invalid target service audience');
      }

      // Bắt buộc phải có sub (tên service gọi sang) hợp lệ
      if (typeof claims.sub !== 'string' || !claims.sub.trim()) {
        throw new Error('Missing internal service caller (sub)');
      }
    } catch (err) {
      if (err instanceof ServiceUnavailableException) {
        throw err;
      }
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Invalid internal JWT, issuer, audience, caller or lifetime',
      });
    }

    const requiredScope =
      this.reflector?.get<string>(INTERNAL_SCOPE_KEY, context.getHandler()) ||
      context.getHandler().name;

    const rawScope = claims.scope;
    const scopes = Array.isArray(rawScope)
      ? rawScope.filter((s): s is string => typeof s === 'string')
      : typeof rawScope === 'string'
        ? rawScope.split(/[\s,]+/).filter(Boolean)
        : [];

    // Bắt buộc khớp đúng tên operation (getUserSummary / getUserAccess), không chấp nhận '*', 'internal', 'internal:users'
    if (!scopes.includes(requiredScope)) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: `Insufficient scope for operation ${requiredScope}`,
      });
    }

    const validCallers = ALLOWED_CALLERS_BY_SCOPE[requiredScope] || [];
    if (!validCallers.includes(claims.sub as string)) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Caller not authorized for operation',
      });
    }

    return true;
  }
}
