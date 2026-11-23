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
import { CurrentUser } from '@lms/auth';
import { LearningAuthGuard } from '../../common/auth/learning-auth.guard';
import type { AuthUser } from '@lms/contracts';
import type { Response } from 'express';
import { ApiExceptionFilter, apiError } from '../../common/api-error';
import { pageQuery } from '../../common/page-query';
import { requestId } from '../../common/request-context';
import { validateRequest } from '../../common/validate-request';
import { MasteryService } from './mastery.service';

@Controller('api/v1/learning/courses/:id/mastery')
@UseFilters(ApiExceptionFilter)
@UseGuards(LearningAuthGuard)
export class MasteryController {
  constructor(private readonly mastery: MasteryService) {}

  @Get()
  async current(
    @Param('id') id: string,
    @Query() query: Record<string, unknown>,
    @CurrentUser() user: AuthUser,
    @Headers('authorization') authorization: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (Object.keys(query).length)
      throw apiError('VALIDATION_ERROR', 'Unexpected query parameters');
    const context = {
      userId: user.id,
      authorization,
      requestId: requestId(response),
    };
    return {
      data: await this.mastery.current(
        validateRequest('Uuid', id).toLowerCase(),
        user,
        context,
      ),
      meta: { requestId: context.requestId },
    };
  }

  @Get('history')
  async history(
    @Param('id') id: string,
    @Query() query: Record<string, unknown>,
    @CurrentUser() user: AuthUser,
    @Headers('authorization') authorization: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const context = {
      userId: user.id,
      authorization,
      requestId: requestId(response),
    };
    return {
      data: await this.mastery.history(
        validateRequest('Uuid', id).toLowerCase(),
        pageQuery(query),
        user,
        context,
      ),
      meta: { requestId: context.requestId },
    };
  }
}
