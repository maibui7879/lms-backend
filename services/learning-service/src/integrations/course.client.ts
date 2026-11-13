import { Injectable } from '@nestjs/common';
import { parseContract } from '@lms/contracts';
import type {
  CourseLearningStructure,
  EnrollmentSnapshotData,
} from '@lms/contracts';
import { apiError } from '../common/api-error';

export interface CourseRequestContext {
  mockUser: string;
  userId: string;
  requestId: string;
}

@Injectable()
export class CourseClient {
  async *enrollments(
    context: CourseRequestContext,
  ): AsyncGenerator<EnrollmentSnapshotData> {
    const limit = 100;
    for (let page = 1; ; page += 1) {
      const data = await this.get(
        `/api/v1/enrollments/me?page=${page}&limit=${limit}`,
        context,
      );
      const { items, total } = this.parse(() => {
        if (!data || typeof data !== 'object')
          throw new Error('Invalid enrollment page');
        const result = data as Record<string, unknown>;
        if (
          result.page !== page ||
          result.limit !== limit ||
          !Array.isArray(result.items) ||
          result.items.length > limit ||
          typeof result.total !== 'number' ||
          !Number.isSafeInteger(result.total) ||
          result.total < 0
        )
          throw new Error('Invalid enrollment page');
        return {
          items: result.items.map((item: unknown) =>
            parseContract('EnrolledCourseData', item),
          ),
          total: result.total,
        };
      });
      for (const { enrollment, course } of items) {
        if (
          enrollment.userId !== context.userId ||
          course.id !== enrollment.courseId
        ) {
          throw apiError(
            'SERVICE_UNAVAILABLE',
            'Course returned an invalid enrollment',
          );
        }
        if (course.status === 'PUBLISHED' && enrollment.status !== 'CANCELLED')
          yield enrollment;
      }
      if (items.length < limit || page * limit >= total) return;
    }
  }

  async structure(
    enrollment: EnrollmentSnapshotData,
    context: CourseRequestContext,
  ): Promise<CourseLearningStructure> {
    const path = `/api/v1/courses/${enrollment.courseId}`;
    const [outline, completionPolicy] = await Promise.all([
      this.get(`${path}/outline`, context),
      this.get(`${path}/completion-policy`, context),
    ]);
    return this.parse(() =>
      parseContract('CourseLearningStructure', { outline, completionPolicy }),
    );
  }

  private async get(
    path: string,
    context: CourseRequestContext,
  ): Promise<unknown> {
    let response: Response;
    try {
      const url = new URL(
        path,
        process.env.COURSE_URL ?? 'http://127.0.0.1:3002',
      );
      response = await fetch(url, {
        headers: {
          'X-Mock-User': context.mockUser,
          'X-Request-Id': context.requestId,
        },
        signal: AbortSignal.timeout(3000),
        redirect: 'error',
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        throw apiError('GATEWAY_TIMEOUT', 'Course service timed out');
      }
      throw apiError('SERVICE_UNAVAILABLE', 'Course service is unavailable');
    }
    if (response.status === 403)
      throw apiError('ENROLLMENT_REQUIRED', 'Course access is required');
    if (response.status === 404)
      throw apiError('NOT_FOUND', 'Course not found');
    if (!response.ok)
      throw apiError('SERVICE_UNAVAILABLE', 'Course service is unavailable');

    try {
      const body: unknown = await response.json();
      if (!body || typeof body !== 'object' || !('data' in body))
        throw new Error('Invalid Course response');
      return body.data;
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        throw apiError('GATEWAY_TIMEOUT', 'Course service timed out');
      }
      throw apiError(
        'SERVICE_UNAVAILABLE',
        'Course returned an invalid response',
      );
    }
  }

  private parse<T>(operation: () => T): T {
    try {
      return operation();
    } catch {
      throw apiError(
        'SERVICE_UNAVAILABLE',
        'Course returned invalid learning data',
      );
    }
  }
}
