import { HttpException, Injectable } from '@nestjs/common';
import { parseContract } from '@lms/contracts';
import type { AttemptAccessData } from '@lms/contracts';
import { apiError } from '../common/api-error';

@Injectable()
export class QuizClient {
  async attemptAccess(
    attemptId: string,
    requestId: string,
  ): Promise<AttemptAccessData | null> {
    const token = process.env.QUIZ_SERVICE_TOKEN?.trim();
    if (!token)
      throw apiError('SERVICE_UNAVAILABLE', 'Quiz service is not configured');

    const signal = AbortSignal.timeout(3000);
    try {
      const url = new URL(
        `/api/v1/internal/attempts/${attemptId}/access`,
        process.env.QUIZ_URL ?? 'http://127.0.0.1:3003',
      );
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Request-Id': requestId,
        },
        redirect: 'error',
        signal,
      });
      if (response.status === 404) return null;
      if (response.status === 504)
        throw apiError('GATEWAY_TIMEOUT', 'Quiz service timed out');
      if (!response.ok) throw new Error('Quiz access lookup failed');

      const body: unknown = await response.json();
      if (!body || typeof body !== 'object' || !('data' in body))
        throw new Error('Invalid Quiz access response');
      const access = parseContract('AttemptAccessData', body.data);
      if (access.attemptId.toLowerCase() !== attemptId)
        throw new Error('Quiz returned access for a different attempt');
      return access;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (
        signal.aborted ||
        (error instanceof DOMException && error.name === 'TimeoutError')
      ) {
        throw apiError('GATEWAY_TIMEOUT', 'Quiz service timed out');
      }
      throw apiError(
        'SERVICE_UNAVAILABLE',
        'Quiz access could not be verified',
      );
    }
  }
}
