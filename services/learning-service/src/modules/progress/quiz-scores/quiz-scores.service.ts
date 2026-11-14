import { Injectable } from '@nestjs/common';
import type { AuthUser, PageQuery } from '@lms/contracts';
import { apiError } from '../../../common/api-error';
import { CourseClient } from '../../../integrations/course.client';
import type { CourseRequestContext } from '../../../integrations/course.client';
import { AssessmentAttemptsRepository } from '../../progress-sync/repositories/assessment-attempts.repository';

@Injectable()
export class QuizScoresService {
  constructor(
    private readonly course: CourseClient,
    private readonly assessments: AssessmentAttemptsRepository,
  ) {}

  async listMine(
    courseId: string,
    page: Required<PageQuery>,
    user: AuthUser,
    context: CourseRequestContext,
  ) {
    if (user.role !== 'STUDENT' || user.status !== 'ACTIVE')
      throw apiError('FORBIDDEN', 'An active student account is required');

    for await (const enrollment of this.course.enrollments(context)) {
      if (enrollment.courseId === courseId) {
        return this.assessments.summarizeQuizScores(courseId, page, enrollment);
      }
    }
    throw apiError('ENROLLMENT_REQUIRED', 'Course access is required');
  }

  async listForCourse(
    courseId: string,
    page: Required<PageQuery>,
    user: AuthUser,
    context: CourseRequestContext,
  ) {
    if (
      user.status !== 'ACTIVE' ||
      (user.role !== 'INSTRUCTOR' && user.role !== 'ADMIN')
    )
      throw apiError(
        'FORBIDDEN',
        'An active instructor or admin account is required',
      );

    const course = await this.course.getCourse(courseId, context);
    if (user.role === 'INSTRUCTOR' && course.instructorId !== user.id)
      throw apiError(
        'NOT_COURSE_OWNER',
        'Course belongs to another instructor',
      );
    return this.assessments.summarizeQuizScores(courseId, page);
  }
}
