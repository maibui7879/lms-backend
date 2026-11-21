import { createPublicKey, timingSafeEqual, verify } from 'node:crypto';
import {
  CanActivate,
  ExecutionContext,
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

    const nodeEnv =
      this.configService.get<string>('NODE_ENV') || process.env.NODE_ENV || '';
    const devServiceToken = (
      this.configService.get<string>('IDENTITY_SERVICE_TOKEN') ||
      process.env.IDENTITY_SERVICE_TOKEN ||
      ''
    ).trim();

    if (['development', 'test'].includes(nodeEnv) && devServiceToken) {
      const expected = Buffer.from(devServiceToken);
      const actual = Buffer.from(token);
      if (
        actual.length === expected.length &&
        timingSafeEqual(actual, expected)
      ) {
        return true;
      }
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

      const claims = JSON.parse(
        Buffer.from(body, 'base64url').toString(),
      ) as Record<string, unknown>;

      const now = Math.floor(Date.now() / 1000);

      if (
        typeof claims.iat !== 'number' ||
        typeof claims.exp !== 'number' ||
        !Number.isSafeInteger(claims.iat) ||
        !Number.isSafeInteger(claims.exp) ||
        claims.iat > now + 60 ||
        claims.exp <= now ||
        claims.exp <= claims.iat ||
        claims.exp - claims.iat > 300
      ) {
        throw new Error('Invalid or expired time claims');
      }

      const allowedIssuersConfig =
        this.configService.get<string>('INTERNAL_JWT_ALLOWED_ISSUERS') ||
        process.env.INTERNAL_JWT_ALLOWED_ISSUERS ||
        'lms-internal';
      const allowedIssuers = allowedIssuersConfig
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (!allowedIssuers.includes('lms-internal')) {
        allowedIssuers.push('lms-internal');
      }

      if (
        typeof claims.iss !== 'string' ||
        !allowedIssuers.includes(claims.iss)
      ) {
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

      const requiredScope =
        this.reflector?.get<string>(INTERNAL_SCOPE_KEY, context.getHandler()) ||
        context.getHandler().name;

      const rawScope = claims.scope;
      const scopes = Array.isArray(rawScope)
        ? rawScope
        : typeof rawScope === 'string'
          ? rawScope.split(/[\s,]+/)
          : [];

      const hasScope =
        scopes.includes(requiredScope) ||
        scopes.includes('*') ||
        scopes.includes('internal') ||
        scopes.includes('internal:users');

      if (!hasScope) {
        throw new Error(`Insufficient scope for operation ${requiredScope}`);
      }

      if (typeof claims.sub === 'string') {
        const allowedCallers: Record<string, string[]> = {
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
        const validCallers = allowedCallers[requiredScope] || allowedIssuers;
        if (!validCallers.includes(claims.sub)) {
          throw new Error('Caller not authorized for operation');
        }
      }

      return true;
    } catch (err) {
      if (err instanceof ServiceUnavailableException) {
        throw err;
      }
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Invalid internal JWT, caller, audience or scope',
      });
    }
  }
}
