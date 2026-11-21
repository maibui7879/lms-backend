import { createPublicKey, verify, timingSafeEqual } from 'node:crypto';
import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';

/** Separate service credential, matching Learning's internal HTTP adapter. */
@Injectable()
export class InternalServiceGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (!['development', 'test'].includes(process.env.NODE_ENV ?? ''))
      return this.verifyServiceJwt(context);
    const token = process.env.COURSE_SERVICE_TOKEN?.trim();
    if (!token)
      throw new ServiceUnavailableException(
        'Course internal credential is not configured',
      );
    const { headers } = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
    }>();
    const supplied =
      typeof headers.authorization === 'string' ? headers.authorization : '';
    const expected = Buffer.from(`Bearer ${token}`);
    const actual = Buffer.from(supplied);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      throw new UnauthorizedException(
        'A valid internal service credential is required',
      );
    return true;
  }

  private verifyServiceJwt(context: ExecutionContext): boolean {
    const publicKey = process.env.INTERNAL_JWT_PUBLIC_KEY?.replace(
      /\\n/g,
      '\n',
    );
    if (!publicKey)
      throw new ServiceUnavailableException(
        'Internal JWT verification is not configured',
      );
    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, unknown> }>();
    const authorization = request.headers.authorization;
    try {
      if (
        typeof authorization !== 'string' ||
        !/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(
          authorization,
        )
      )
        throw new Error();
      const [head, body, signature] = authorization.slice(7).split('.');
      const metadata = JSON.parse(
        Buffer.from(head, 'base64url').toString(),
      ) as { alg?: string };
      const key = createPublicKey(publicKey);
      if (
        metadata.alg !== 'RS256' ||
        key.asymmetricKeyType !== 'rsa' ||
        !verify(
          'RSA-SHA256',
          Buffer.from(`${head}.${body}`),
          key,
          Buffer.from(signature, 'base64url'),
        )
      )
        throw new Error();
      const claims = JSON.parse(
        Buffer.from(body, 'base64url').toString(),
      ) as Record<string, unknown>;
      const now = Math.floor(Date.now() / 1000);
      const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
      if (
        claims.iss !== 'lms-internal' ||
        !audiences.includes('course-service') ||
        typeof claims.iat !== 'number' ||
        typeof claims.exp !== 'number' ||
        !Number.isSafeInteger(claims.iat) ||
        !Number.isSafeInteger(claims.exp) ||
        claims.iat > now ||
        claims.exp <= now ||
        claims.exp <= claims.iat ||
        claims.exp - claims.iat > 300
      )
        throw new Error();
      const operation =
        context.getHandler().name === 'context'
          ? 'getCourseItemMigrationContext'
          : context.getHandler().name;
      const callers: Record<string, string[]> = {
        checkEnrollment: ['quiz-service', 'learning-service'],
        checkCourseAccess: ['quiz-service', 'learning-service'],
        getContentReference: ['quiz-service'],
        getLearningStructure: ['learning-service'],
        getCourseItemMigrationContext: ['learning-service'],
      };
      const scopes =
        typeof claims.scope === 'string'
          ? claims.scope.split(' ')
          : claims.scope;
      if (
        typeof claims.sub !== 'string' ||
        !callers[operation]?.includes(claims.sub) ||
        !Array.isArray(scopes) ||
        !scopes.includes(operation)
      )
        throw new Error();
      return true;
    } catch {
      throw new UnauthorizedException(
        'Invalid internal JWT, caller, audience or scope',
      );
    }
  }
}
