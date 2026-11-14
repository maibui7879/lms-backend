import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser, MockAuthGuard } from '@lms/auth';
import type { AuthUser } from '@lms/contracts';
import type { Response } from 'express';
import { ApiExceptionFilter, apiError } from '../../common/api-error';
import { requestId } from '../../common/request-context';
import { validateRequest } from '../../common/validate-request';
import { CourseSkillsService } from './course-skills.service';

function trimSkillText<T extends { name?: string; description?: string }>(
  input: T,
): T {
  const body = { ...input };
  if (body.name !== undefined) body.name = body.name.trim();
  if (body.description !== undefined)
    body.description = body.description.trim();
  return body;
}

@Controller('api/v1/learning/courses/:id/skills')
@UseFilters(ApiExceptionFilter)
@UseGuards(MockAuthGuard)
export class CourseSkillsController {
  constructor(private readonly skills: CourseSkillsService) {}

  @Get()
  async list(
    @Param('id') id: string,
    @Query() query: Record<string, unknown>,
    @CurrentUser() user: AuthUser,
    @Headers('x-mock-user') mockUser: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (Object.keys(query).length)
      throw apiError('VALIDATION_ERROR', 'Unexpected query parameters');
    const context = {
      userId: user.id,
      mockUser,
      requestId: requestId(response),
    };
    return {
      data: await this.skills.list(
        validateRequest('Uuid', id).toLowerCase(),
        user,
        context,
      ),
      meta: { requestId: context.requestId },
    };
  }

  @Post()
  async create(
    @Param('id') id: string,
    @Body() input: unknown,
    @CurrentUser() user: AuthUser,
    @Headers('x-mock-user') mockUser: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const context = {
      userId: user.id,
      mockUser,
      requestId: requestId(response),
    };
    return {
      data: await this.skills.create(
        validateRequest('Uuid', id).toLowerCase(),
        trimSkillText(validateRequest('CreateCourseSkillRequest', input)),
        user,
        context,
      ),
      meta: { requestId: context.requestId },
    };
  }

  @Patch(':skillId')
  async update(
    @Param('id') id: string,
    @Param('skillId') skillId: string,
    @Body() input: unknown,
    @CurrentUser() user: AuthUser,
    @Headers('x-mock-user') mockUser: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const context = {
      userId: user.id,
      mockUser,
      requestId: requestId(response),
    };
    return {
      data: await this.skills.update(
        validateRequest('Uuid', id).toLowerCase(),
        validateRequest('Uuid', skillId).toLowerCase(),
        trimSkillText(validateRequest('UpdateCourseSkillRequest', input)),
        user,
        context,
      ),
      meta: { requestId: context.requestId },
    };
  }
}
