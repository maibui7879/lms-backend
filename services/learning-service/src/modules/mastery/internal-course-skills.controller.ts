import {
  Body,
  Controller,
  Get,
  HttpCode,
  Injectable,
  Param,
  Post,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiExceptionFilter } from '../../common/api-error';
import { InternalServiceGuard } from '../../common/internal-service.guard';
import { requestId } from '../../common/request-context';
import { validateRequest } from '../../common/validate-request';
import { CourseSkillsService } from './course-skills.service';

@Injectable()
class SkillLookupGuard extends InternalServiceGuard {
  protected override readonly credentialVariable =
    'LEARNING_SKILL_LOOKUP_TOKEN';
}

@Controller('api/v1/internal/courses/:id/skills')
@UseFilters(ApiExceptionFilter)
@UseGuards(SkillLookupGuard)
export class InternalCourseSkillsController {
  constructor(private readonly skills: CourseSkillsService) {}

  @Post('validate')
  @HttpCode(204)
  async validate(
    @Param('id') id: string,
    @Body() input: unknown,
  ): Promise<void> {
    const courseId = validateRequest('Uuid', id).toLowerCase();
    const { skillIds } = validateRequest('ValidateCourseSkillsRequest', input);
    await this.skills.requireAssignable(
      courseId,
      skillIds.map((skillId) => skillId.toLowerCase()),
    );
  }

  @Get(':skillId')
  async get(
    @Param('id') id: string,
    @Param('skillId') skillId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    return {
      data: await this.skills.getForService(
        validateRequest('Uuid', id).toLowerCase(),
        validateRequest('Uuid', skillId).toLowerCase(),
      ),
      meta: { requestId: requestId(response) },
    };
  }
}
