import { HttpException, Injectable } from '@nestjs/common';
import { ERROR_HTTP_STATUS, parseContract } from '@lms/contracts';
import type {
  CourseOutlineData,
  CreateQuizRequest,
  DomainErrorCode,
} from '@lms/contracts';

export interface CourseRequestContext {
  authorization?: string;
  mockUser?: string;
  requestId: string;
}

@Injectable()
export class CourseClient {
  async requireQuizPlacement(
    request: CreateQuizRequest,
    context: CourseRequestContext,
  ): Promise<void> {
    this.assertOwnerReviewPage(
      await this.get(
        `/api/v1/courses/${request.courseId}/reviews?page=1&limit=1`,
        context,
        'NOT_COURSE_OWNER',
      ),
      request.courseId,
    );

    const rawOutline = await this.get(
      `/api/v1/courses/${request.courseId}/outline`,
      context,
      'NOT_COURSE_OWNER',
    );
    const outline = this.parseOutline(rawOutline, request.courseId);
    const chapter = outline.chapters.find(
      (item) => item.id.toLowerCase() === request.chapterId.toLowerCase(),
    );

    if (
      !chapter ||
      chapter.courseId.toLowerCase() !== request.courseId.toLowerCase()
    )
      throw this.domainError(
        'INVALID_LESSON_RELATION',
        'Chapter does not belong to the requested course',
      );

    if (
      request.placement === 'LESSON' &&
      !chapter.lessons.some(
        (lesson) =>
          lesson.id.toLowerCase() === request.lessonId.toLowerCase() &&
          lesson.chapterId.toLowerCase() === request.chapterId.toLowerCase() &&
          lesson.courseId.toLowerCase() === request.courseId.toLowerCase(),
      )
    )
      throw this.domainError(
        'INVALID_LESSON_RELATION',
        'Lesson does not belong to the requested chapter',
      );
  }

  private async get(
    path: string,
    context: CourseRequestContext,
    forbiddenCode: 'NOT_COURSE_OWNER',
  ): Promise<unknown> {
    let response: Response;
    try {
      const url = new URL(
        path,
        process.env.COURSE_URL ?? 'http://127.0.0.1:3002',
      );
      const useMockUser =
        process.env.MOCK_AUTH === 'true' &&
        typeof context.mockUser === 'string';
      const authorization = useMockUser ? undefined : context.authorization;
      if (!authorization && !useMockUser)
        throw this.domainError(
          'SERVICE_UNAVAILABLE',
          'Course authorization context is unavailable',
        );

      response = await fetch(url, {
        headers: {
          ...(authorization ? { Authorization: authorization } : {}),
          ...(useMockUser ? { 'X-Mock-User': context.mockUser! } : {}),
          'X-Request-Id': context.requestId,
        },
        signal: AbortSignal.timeout(3000),
        redirect: 'error',
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (error instanceof Error && error.name === 'TimeoutError')
        throw this.domainError('GATEWAY_TIMEOUT', 'Course service timed out');
      throw this.domainError(
        'SERVICE_UNAVAILABLE',
        'Course service is unavailable',
      );
    }

    if (response.status === 401)
      throw this.domainError(
        'UNAUTHORIZED',
        'Course rejected user credentials',
      );
    if (response.status === 403)
      throw this.domainError(
        forbiddenCode,
        'Course ownership is required to create a quiz',
      );
    if (response.status === 404)
      throw this.domainError('NOT_FOUND', 'Course was not found');
    if (!response.ok)
      throw this.domainError(
        'SERVICE_UNAVAILABLE',
        'Course service is unavailable',
      );

    try {
      const body: unknown = await response.json();
      if (
        !body ||
        typeof body !== 'object' ||
        !('data' in body) ||
        !('meta' in body)
      )
        throw new Error('Invalid Course response');
      parseContract('ApiMeta', body.meta);
      return body.data;
    } catch {
      throw this.domainError(
        'SERVICE_UNAVAILABLE',
        'Course returned an invalid response',
      );
    }
  }

  private parseOutline(data: unknown, courseId: string): CourseOutlineData {
    try {
      const outline = parseContract('CourseOutlineData', data);
      if (outline.courseId.toLowerCase() !== courseId.toLowerCase())
        throw new Error('Course returned a different course outline');
      return outline;
    } catch {
      throw this.domainError(
        'SERVICE_UNAVAILABLE',
        'Course returned an invalid outline',
      );
    }
  }

  private assertOwnerReviewPage(data: unknown, courseId: string): void {
    try {
      if (!data || typeof data !== 'object')
        throw new Error('Invalid Course review page');
      const page = data as Record<string, unknown>;
      if (
        page.page !== 1 ||
        page.limit !== 1 ||
        typeof page.total !== 'number' ||
        !Number.isSafeInteger(page.total) ||
        page.total < 0 ||
        !Array.isArray(page.items) ||
        page.items.length !== Math.min(page.total, 1)
      )
        throw new Error('Invalid Course review page');

      for (const item of page.items) {
        const review = parseContract('CourseReviewData', item);
        if (review.courseId.toLowerCase() !== courseId.toLowerCase())
          throw new Error('Course returned a review for another course');
      }
    } catch {
      throw this.domainError(
        'SERVICE_UNAVAILABLE',
        'Course returned an invalid ownership response',
      );
    }
  }

  private domainError(code: DomainErrorCode, message: string): HttpException {
    return new HttpException(
      { code, message, details: {} },
      ERROR_HTTP_STATUS[code],
    );
  }
}
