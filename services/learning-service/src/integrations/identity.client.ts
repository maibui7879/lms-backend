import { HttpException, Injectable } from '@nestjs/common';
import { parseContract } from '@lms/contracts';
import { apiError } from '../common/api-error';
import type { CourseRequestContext } from './course.client';

@Injectable()
export class IdentityClient {
  async certificateRecipient({
    userId,
    mockUser,
    requestId,
  }: CourseRequestContext): Promise<string> {
    const base = process.env.IDENTITY_URL;
    if (!base)
      throw apiError('SERVICE_UNAVAILABLE', 'Identity URL is unavailable');
    try {
      const response = await fetch(new URL('/api/v1/users/me', base), {
        headers: { 'X-Mock-User': mockUser, 'X-Request-Id': requestId },
        signal: AbortSignal.timeout(2500),
        redirect: 'error',
      });
      if (!response.ok) throw new Error('Identity profile is unavailable');
      const body: unknown = await response.json();
      const profile = parseContract(
        'UserProfile',
        (body as { data?: unknown })?.data,
      );
      const name = profile.displayName
        .normalize('NFC')
        .replace(/\s+/g, ' ')
        .trim();
      if (
        profile.id.toLowerCase() !== userId.toLowerCase() ||
        profile.status !== 'ACTIVE' ||
        !name
      )
        throw apiError(
          'SERVICE_UNAVAILABLE',
          'Identity returned an invalid certificate recipient',
        );
      return name;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw apiError('SERVICE_UNAVAILABLE', 'Identity profile is unavailable');
    }
  }
}
