import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Put,
  Query,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '@lms/auth';
import { LearningAuthGuard } from '../../common/auth/learning-auth.guard';
import type { AuthUser } from '@lms/contracts';
import type { Response } from 'express';
import { ApiExceptionFilter, apiError } from '../../common/api-error';
import { requestId } from '../../common/request-context';
import { validateRequest } from '../../common/validate-request';
import { CourseSkillsService } from '../mastery/course-skills.service';
import { SkillPrerequisitesRepository } from './repositories/skill-prerequisites.repository';

@Controller('api/v1/learning/courses/:id/skill-prerequisites')
@UseFilters(ApiExceptionFilter)
@UseGuards(LearningAuthGuard)
export class SkillPrerequisitesController {
  constructor(
    private readonly skills: CourseSkillsService,
    private readonly graphs: SkillPrerequisitesRepository,
  ) {}

  @Get()
  async get(
    @Param('id') id: string,
    @Query() query: Record<string, unknown>,
    @CurrentUser() user: AuthUser,
    @Headers('authorization') authorization: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (Object.keys(query).length)
      throw apiError('VALIDATION_ERROR', 'Unexpected query parameters');
    const courseId = validateRequest('Uuid', id).toLowerCase();
    const currentRequestId = requestId(response);
    await this.skills.requireManager(courseId, user, {
      userId: user.id,
      authorization,
      requestId: currentRequestId,
    });
    return {
      data: await this.graphs.get(courseId),
      meta: { requestId: currentRequestId },
    };
  }

  @Put()
  async save(
    @Param('id') id: string,
    @Body() input: unknown,
    @Query() query: Record<string, unknown>,
    @CurrentUser() user: AuthUser,
    @Headers('authorization') authorization: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (Object.keys(query).length)
      throw apiError('VALIDATION_ERROR', 'Unexpected query parameters');
    const courseId = validateRequest('Uuid', id).toLowerCase();
    const currentRequestId = requestId(response);
    await this.skills.requireManager(courseId, user, {
      userId: user.id,
      authorization,
      requestId: currentRequestId,
    });
    const body = validateRequest('SaveSkillPrerequisitesRequest', input);
    return {
      data: await this.graphs.save(courseId, body),
      meta: { requestId: currentRequestId },
    };
  }
}
