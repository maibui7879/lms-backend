import {
  Controller,
  Get,
  Headers,
  Query,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '@lms/auth';
import { LearningAuthGuard } from '../../common/auth/learning-auth.guard';
import type { AuthUser } from '@lms/contracts';
import type { Response } from 'express';
import { ApiExceptionFilter } from '../../common/api-error';
import { pageQuery } from '../../common/page-query';
import { requestId } from '../../common/request-context';
import { RecommendationsService } from './recommendations.service';

@Controller('api/v1/learning/me/recommendations')
@UseFilters(ApiExceptionFilter)
@UseGuards(LearningAuthGuard)
export class RecommendationsController {
  constructor(private readonly recommendations: RecommendationsService) {}

  @Get()
  async list(
    @Query() query: Record<string, unknown>,
    @CurrentUser() user: AuthUser,
    @Headers('authorization') authorization: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const id = requestId(response);
    const data = await this.recommendations.list(
      user,
      { userId: user.id, authorization, requestId: id },
      pageQuery(query),
    );
    return { data, meta: { requestId: id } };
  }
}
