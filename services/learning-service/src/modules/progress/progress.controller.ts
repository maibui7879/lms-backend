import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Put,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser, MockAuthGuard } from '@lms/auth';
import type {
  ApiResponse,
  AuthUser,
  CompleteItemRequest,
  CompleteLessonRequest,
  CourseChapterAccessData,
  CourseProgressData,
  ItemProgressData,
  LearningResumeData,
  LessonProgressData,
  SaveResumeRequest,
} from '@lms/contracts';
import type { Response } from 'express';
import { apiError, ApiExceptionFilter } from '../../common/api-error';
import { requestId } from '../../common/request-context';
import { validateRequest } from '../../common/validate-request';
import { CompleteItemRequestPipe } from './dto/complete-item-request.pipe';
import { CompleteLessonRequestPipe } from './dto/complete-lesson-request.pipe';
import { SaveResumeRequestPipe } from './dto/save-resume-request.pipe';
import { ProgressService } from './progress.service';

function contextFor(user: AuthUser, mockUser: string, response: Response) {
  if (user.role !== 'STUDENT' || user.status !== 'ACTIVE') {
    throw apiError('FORBIDDEN', 'An active student account is required');
  }
  return { mockUser, userId: user.id, requestId: requestId(response) };
}

@Controller('api/v1/learning')
@UseFilters(ApiExceptionFilter)
@UseGuards(MockAuthGuard)
export class ProgressController {
  constructor(private readonly progress: ProgressService) {}

  @Get('lessons/:id/progress')
  async getLessonProgress(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Headers('x-mock-user') mockUser: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiResponse<LessonProgressData>> {
    const context = contextFor(user, mockUser, response);
    return {
      data: await this.progress.getLessonProgress(
        validateRequest('Uuid', id).toLowerCase(),
        context,
      ),
      meta: { requestId: context.requestId },
    };
  }

  @Put('lessons/:id/completion')
  async completeLesson(
    @Param('id') id: string,
    @Body(CompleteLessonRequestPipe) body: CompleteLessonRequest,
    @CurrentUser() user: AuthUser,
    @Headers('x-mock-user') mockUser: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiResponse<LessonProgressData>> {
    const context = contextFor(user, mockUser, response);
    return {
      data: await this.progress.completeLesson(
        validateRequest('Uuid', id).toLowerCase(),
        body,
        context,
      ),
      meta: { requestId: context.requestId },
    };
  }

  @Get('courses/:id/progress')
  async getCourseProgress(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Headers('x-mock-user') mockUser: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiResponse<CourseProgressData>> {
    const context = contextFor(user, mockUser, response);
    return {
      data: await this.progress.getCourseProgress(
        validateRequest('Uuid', id).toLowerCase(),
        context,
      ),
      meta: { requestId: context.requestId },
    };
  }

  @Get('courses/:id/chapters/access')
  async getCourseChapterAccess(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Headers('x-mock-user') mockUser: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiResponse<CourseChapterAccessData>> {
    const context = contextFor(user, mockUser, response);
    return {
      data: await this.progress.getCourseChapterAccess(
        validateRequest('Uuid', id).toLowerCase(),
        context,
      ),
      meta: { requestId: context.requestId },
    };
  }

  @Get('courses/:id/resume')
  async getResume(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Headers('x-mock-user') mockUser: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiResponse<LearningResumeData | null>> {
    const context = contextFor(user, mockUser, response);
    return {
      data: await this.progress.getResume(
        validateRequest('Uuid', id).toLowerCase(),
        context,
      ),
      meta: { requestId: context.requestId },
    };
  }

  @Put('courses/:id/resume')
  async saveResume(
    @Param('id') id: string,
    @Body(SaveResumeRequestPipe) body: SaveResumeRequest,
    @CurrentUser() user: AuthUser,
    @Headers('x-mock-user') mockUser: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiResponse<LearningResumeData>> {
    const context = contextFor(user, mockUser, response);
    return {
      data: await this.progress.saveResume(
        validateRequest('Uuid', id).toLowerCase(),
        body,
        context,
      ),
      meta: { requestId: context.requestId },
    };
  }

  @Put('items/:id/completion')
  async completeItem(
    @Param('id') id: string,
    @Body(CompleteItemRequestPipe) body: CompleteItemRequest,
    @CurrentUser() user: AuthUser,
    @Headers('x-mock-user') mockUser: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiResponse<ItemProgressData>> {
    const context = contextFor(user, mockUser, response);
    return {
      data: await this.progress.completeItem(
        validateRequest('Uuid', id).toLowerCase(),
        body,
        context,
      ),
      meta: { requestId: context.requestId },
    };
  }
}
