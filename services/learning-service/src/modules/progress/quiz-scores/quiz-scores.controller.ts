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
import type {
  ApiResponse,
  AuthUser,
  LearnerAssessmentSummary,
  PageData,
} from '@lms/contracts';
import type { Response } from 'express';
import { ApiExceptionFilter } from '../../../common/api-error';
import { pageQuery } from '../../../common/page-query';
import { requestId } from '../../../common/request-context';
import { validateRequest } from '../../../common/validate-request';
import { QuizScoresService } from './quiz-scores.service';

@Controller('api/v1/learning/courses/:id')
@UseFilters(ApiExceptionFilter)
@UseGuards(MockAuthGuard)
export class QuizScoresController {
  constructor(private readonly quizScores: QuizScoresService) {}

  @Get('me/quiz-scores')
  async listMine(
    @Param('id') id: string,
    @Query() query: Record<string, unknown>,
    @CurrentUser() user: AuthUser,
    @Headers('x-mock-user') mockUser: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiResponse<PageData<LearnerAssessmentSummary>>> {
    const context = {
      userId: user.id,
      mockUser,
      requestId: requestId(response),
    };
    return {
      data: await this.quizScores.listMine(
        validateRequest('Uuid', id).toLowerCase(),
        pageQuery(query),
        user,
        context,
      ),
      meta: { requestId: context.requestId },
    };
  }

  @Get('quiz-scores')
  async listForCourse(
    @Param('id') id: string,
    @Query() query: Record<string, unknown>,
    @CurrentUser() user: AuthUser,
    @Headers('x-mock-user') mockUser: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiResponse<PageData<LearnerAssessmentSummary>>> {
    const context = {
      userId: user.id,
      mockUser,
      requestId: requestId(response),
    };
    return {
      data: await this.quizScores.listForCourse(
        validateRequest('Uuid', id).toLowerCase(),
        pageQuery(query),
        user,
        context,
      ),
      meta: { requestId: context.requestId },
    };
  }
}
