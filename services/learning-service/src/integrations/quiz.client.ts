import { HttpException, Injectable } from '@nestjs/common';
import { parseContract } from '@lms/contracts';
import type {
  AttemptAccessData,
  QuizRecommendationContext,
  QuizRecommendationContextQuery,
} from '@lms/contracts';
import { apiError } from '../common/api-error';

@Injectable()
export class QuizClient {
  async attemptAccess(
    attemptId: string,
    requestId: string,
  ): Promise<AttemptAccessData | null> {
    return this.get(
      `/api/v1/internal/attempts/${attemptId}/access`,
      requestId,
      'AttemptAccessData',
      (access) => access.attemptId.toLowerCase() === attemptId,
    );
  }

  async recommendationContext(
    quizId: string,
    query: QuizRecommendationContextQuery,
    requestId: string,
  ): Promise<QuizRecommendationContext | null> {
    const search = new URLSearchParams({
      ...query,
      assessmentVersion: String(query.assessmentVersion),
    });
    return this.get(
      `/api/v1/internal/quizzes/${quizId}/recommendation-context?${search}`,
      requestId,
      'QuizRecommendationContext',
      (result) =>
        result.quizId.toLowerCase() === quizId.toLowerCase() &&
        result.courseId.toLowerCase() === query.courseId.toLowerCase() &&
        result.userId.toLowerCase() === query.userId.toLowerCase() &&
        result.assessmentVersion === query.assessmentVersion &&
        Number.isSafeInteger(result.attemptsRemaining),
    );
  }

  private async get<
    K extends 'AttemptAccessData' | 'QuizRecommendationContext',
  >(
    path: string,
    requestId: string,
    schema: K,
    matches: (data: ReturnType<typeof parseContract<K>>) => boolean,
  ) {
    const token = process.env.QUIZ_SERVICE_TOKEN?.trim();
    if (!token)
      throw apiError('SERVICE_UNAVAILABLE', 'Quiz service is not configured');

    const signal = AbortSignal.timeout(3000);
    try {
      const url = new URL(
        path,
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
      const data = parseContract(schema, body.data);
      if (!matches(data))
        throw new Error('Quiz response does not match the request');
      return data;
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
