import {
  Controller,
  Get,
  Headers,
  Param,
  Query,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser, MockAuthGuard } from '@lms/auth';
import type { AuthUser } from '@lms/contracts';
import type { Response } from 'express';
import { apiError, ApiExceptionFilter } from '../../common/api-error';
import { pageQuery } from '../../common/page-query';
import { requestId } from '../../common/request-context';
import { validateRequest } from '../../common/validate-request';
import { InstructorReportsService } from './instructor-reports.service';

function instructorContext(
  user: AuthUser,
  mockUser: string,
  response: Response,
) {
  if (
    user.status !== 'ACTIVE' ||
    (user.role !== 'INSTRUCTOR' && user.role !== 'ADMIN')
  )
    throw apiError('FORBIDDEN', 'An active instructor or admin is required');
  response.setHeader('Cache-Control', 'private, no-store');
  return { userId: user.id, mockUser, requestId: requestId(response) };
}

@Controller('api/v1/learning/courses/:id')
@UseFilters(ApiExceptionFilter)
@UseGuards(MockAuthGuard)
export class InstructorReportsController {
  constructor(private readonly reports: InstructorReportsService) {}

  @Get('learners')
  async list(
    @Param('id') id: string,
    @Query() query: Record<string, unknown>,
    @CurrentUser() user: AuthUser,
    @Headers('x-mock-user') mockUser: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const context = instructorContext(user, mockUser, response);
    const data = await this.reports.list(
      validateRequest('Uuid', id).toLowerCase(),
      pageQuery(query),
      context,
    );
    return { data, meta: { requestId: context.requestId } };
  }

  @Get('learners/:userId')
  async detail(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @CurrentUser() user: AuthUser,
    @Headers('x-mock-user') mockUser: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const context = instructorContext(user, mockUser, response);
    const data = await this.reports.detail(
      validateRequest('Uuid', id).toLowerCase(),
      validateRequest('Uuid', userId).toLowerCase(),
      context,
    );
    return { data, meta: { requestId: context.requestId } };
  }

  @Get('statistics')
  async statistics(
    @Param('id') id: string,
    @Query() query: Record<string, unknown>,
    @CurrentUser() user: AuthUser,
    @Headers('x-mock-user') mockUser: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const context = instructorContext(user, mockUser, response);
    const data = await this.reports.statistics(
      validateRequest('Uuid', id).toLowerCase(),
      validateRequest('LearningReportDateQuery', query),
      context,
    );
    return { data, meta: { requestId: context.requestId } };
  }

  @Get('weak-skills')
  async weakSkills(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Headers('x-mock-user') mockUser: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const context = instructorContext(user, mockUser, response);
    const data = await this.reports.weakSkills(
      validateRequest('Uuid', id).toLowerCase(),
      context,
    );
    return { data, meta: { requestId: context.requestId } };
  }

  @Get('analytics')
  async analytics(
    @Param('id') id: string,
    @Query() query: Record<string, unknown>,
    @CurrentUser() user: AuthUser,
    @Headers('x-mock-user') mockUser: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const context = instructorContext(user, mockUser, response);
    const values = { ...query };
    if (
      typeof values.assessmentVersion === 'string' &&
      /^\d+$/.test(values.assessmentVersion)
    ) {
      const version = Number(values.assessmentVersion);
      if (Number.isSafeInteger(version)) values.assessmentVersion = version;
    }
    const parsed = validateRequest('LearningAnalyticsQuery', values);
    if (parsed.assessmentVersion !== undefined && !parsed.quizId)
      throw apiError('VALIDATION_ERROR', 'assessmentVersion requires quizId');
    const data = await this.reports.analytics(
      validateRequest('Uuid', id).toLowerCase(),
      {
        ...parsed,
        quizId: parsed.quizId?.toLowerCase(),
        classId: parsed.classId?.toLowerCase(),
      },
      context,
    );
    return { data, meta: { requestId: context.requestId } };
  }
}
