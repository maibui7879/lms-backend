import { timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { apiError } from './api-error';

@Injectable()
export class InternalServiceGuard implements CanActivate {
  protected readonly credentialVariable: string = 'LEARNING_SERVICE_TOKEN';

  canActivate(context: ExecutionContext): boolean {
    const token = process.env[this.credentialVariable]?.trim();
    if (!token)
      throw apiError(
        'SERVICE_UNAVAILABLE',
        'Learning internal credential is not configured',
      );
    const { headers } = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
    }>();
    const supplied =
      typeof headers.authorization === 'string' ? headers.authorization : '';
    const expected = Buffer.from(`Bearer ${token}`);
    const actual = Buffer.from(supplied);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      throw apiError(
        'UNAUTHORIZED',
        'A valid internal service credential is required',
      );
    return true;
  }
}
