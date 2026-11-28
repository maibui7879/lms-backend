import { HttpException, Injectable } from '@nestjs/common';
import { parseContract } from '@lms/contracts';
import { apiError } from '../common/api-error';
import { createServiceToken } from '../common/auth/service-token';
import type { CourseRequestContext } from './course.client';

@Injectable()
export class IdentityClient {
  async accessStatus(userId: string, requestId?: string) {
    const data = await this.get(userId, 'getUserAccess', requestId);
    try {
      const access = parseContract('UserAccessStatus', data);
      if (access.userId.toLowerCase() !== userId.toLowerCase())
        throw new Error('Unexpected identity');
      return access;
    } catch {
      throw apiError(
        'SERVICE_UNAVAILABLE',
        'Identity returned invalid account access',
      );
    }
  }

  async certificateRecipient({
    userId,
    requestId,
  }: CourseRequestContext): Promise<string> {
    const data = await this.get(userId, 'getUserSummary', requestId);
    try {
      const profile = parseContract('UserSummary', data);
      const name = profile.displayName
        .normalize('NFC')
        .replace(/\s+/g, ' ')
        .trim();
      if (
        profile.id.toLowerCase() !== userId.toLowerCase() ||
        profile.status !== 'ACTIVE' ||
        !name
      )
        throw new Error('Invalid certificate recipient');
      return name;
    } catch {
      throw apiError(
        'SERVICE_UNAVAILABLE',
        'Identity returned an invalid certificate recipient',
      );
    }
  }

  private async get(
    userId: string,
    scope: 'getUserAccess' | 'getUserSummary',
    requestId?: string,
  ): Promise<unknown> {
    const base = process.env.IDENTITY_URL;
    if (!base)
      throw apiError('SERVICE_UNAVAILABLE', 'Identity URL is unavailable');
    const token = createServiceToken('identity', scope);
    try {
      const suffix = scope === 'getUserAccess' ? '/access' : '';
      const response = await fetch(
        new URL(`/api/v1/internal/users/${userId}${suffix}`, base),
        {
          headers: {
            Authorization: `Bearer ${token}`,
            ...(requestId ? { 'X-Request-Id': requestId } : {}),
          },
          signal: AbortSignal.timeout(2500),
          redirect: 'error',
        },
      );
      if (scope === 'getUserAccess' && response.status === 404)
        throw apiError('UNAUTHORIZED', 'The account no longer exists');
      if (!response.ok) throw new Error('Identity is unavailable');
      const body: unknown = await response.json();
      return (body as { data?: unknown })?.data;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw apiError('SERVICE_UNAVAILABLE', 'Identity service is unavailable');
    }
  }
}
