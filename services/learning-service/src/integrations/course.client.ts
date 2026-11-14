import { Injectable } from '@nestjs/common';
import { parseContract } from '@lms/contracts';
import type {
  CourseData,
  CourseItemMigrationContext,
  CourseLearningStructure,
  EnrolledCourseData,
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
  async migrationContext(
    revisionId: string,
    requestId: string,
  ): Promise<CourseItemMigrationContext> {
    const token = process.env.COURSE_SERVICE_TOKEN?.trim();
    if (!token)
      throw apiError(
        'SERVICE_UNAVAILABLE',
        'Course service credential is not configured',
      );
    const data = await this.get(
      `/api/v1/internal/course-revisions/${revisionId}/item-migration-context`,
      { mockUser: '', userId: '', requestId },
      token,
    );
    return this.parse(() => parseContract('CourseItemMigrationContext', data));
  }

  async getCourse(
    courseId: string,
    context: CourseRequestContext,
  ): Promise<CourseData> {
    const data = await this.get(`/api/v1/courses/${courseId}`, context);
    return this.parse(() => {
      const course = parseContract('CourseData', data);
      if (course.id.toLowerCase() !== courseId)
        throw new Error('Unexpected course ID');
      return course;
    });
  }

  async *enrollments(
    context: CourseRequestContext,
  ): AsyncGenerator<EnrollmentSnapshotData> {
    for await (const { enrollment } of this.enrolledCourses(context)) {
      yield enrollment;
    }
  }

  async *enrolledCourses(
    context: CourseRequestContext,
  ): AsyncGenerator<EnrolledCourseData> {
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
          yield { enrollment, course };
      }
      if (page * limit >= total) return;
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
    const structure = this.parse(() =>
      parseContract('CourseLearningStructure', { outline, completionPolicy }),
    );
    const serviceToken = process.env.COURSE_SERVICE_TOKEN;
    if (
      serviceToken &&
      (structure.outline.contentVersion !== enrollment.contentVersion ||
        structure.completionPolicy.contentVersion !== enrollment.contentVersion)
    ) {
      const snapshot = await this.get(
        `/api/v1/internal/courses/${enrollment.courseId}/structure?contentVersion=${enrollment.contentVersion}`,
        context,
        serviceToken,
      );
      return this.parse(() =>
        parseContract('CourseLearningStructure', snapshot),
      );
    }
    return structure;
  }

  private async get(
    path: string,
    context: CourseRequestContext,
    serviceToken?: string,
  ): Promise<unknown> {
    let response: Response;
    try {
      const url = new URL(
        path,
        process.env.COURSE_URL ?? 'http://127.0.0.1:3002',
      );
      response = await fetch(url, {
        headers: {
          ...(serviceToken
            ? { Authorization: `Bearer ${serviceToken}` }
            : { 'X-Mock-User': context.mockUser }),
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
    if (serviceToken && [404, 409].includes(response.status))
      throw apiError(
        'CONTENT_VERSION_MISMATCH',
        'The enrolled course version is unavailable',
      );
    if (serviceToken && [401, 403].includes(response.status))
      throw apiError(
        'SERVICE_UNAVAILABLE',
        'Course denied the service credential',
      );
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
