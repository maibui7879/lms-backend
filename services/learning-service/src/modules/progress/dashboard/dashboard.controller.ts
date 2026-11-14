import {
  Controller,
  Get,
  Headers,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser, MockAuthGuard } from '@lms/auth';
import type {
  ApiResponse,
  AuthUser,
  LearningDashboardData,
} from '@lms/contracts';
import type { Response } from 'express';
import { apiError, ApiExceptionFilter } from '../../../common/api-error';
import { requestId } from '../../../common/request-context';
import { CourseClient } from '../../../integrations/course.client';
import { ProgressService } from '../progress.service';
import { sortRecentQuizzes } from '../rules/recent-quiz';

@Controller('api/v1/learning/me/dashboard')
@UseFilters(ApiExceptionFilter)
@UseGuards(MockAuthGuard)
export class DashboardController {
  constructor(
    private readonly course: CourseClient,
    private readonly progress: ProgressService,
  ) {}

  @Get()
  async getDashboard(
    @CurrentUser() user: AuthUser,
    @Headers('x-mock-user') mockUser: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiResponse<LearningDashboardData>> {
    if (user.status !== 'ACTIVE')
      throw apiError('FORBIDDEN', 'An active account is required');

    const context = {
      userId: user.id,
      mockUser,
      requestId: requestId(response),
    };
    const courses: LearningDashboardData['courses'] = [];
    const recentQuizzes: LearningDashboardData['recentQuizzes'] = [];
    for await (const { enrollment, course } of this.course.enrolledCourses(
      context,
    )) {
      const entry = await this.progress.dashboardCourse(
        enrollment,
        course.title,
        context,
      );
      courses.push(entry.course);
      recentQuizzes.push(...entry.recentQuizzes);
    }

    courses.sort(
      (a, b) =>
        Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt) ||
        a.courseId.localeCompare(b.courseId),
    );
    recentQuizzes.sort(sortRecentQuizzes);
    return {
      data: {
        courses,
        recentQuizzes: recentQuizzes.slice(0, 10),
        updatedAt: courses[0]?.lastActivityAt ?? new Date().toISOString(),
      },
      meta: { requestId: context.requestId },
    };
  }
}
