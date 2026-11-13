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
  CourseChapterAccessData,
  CourseProgressData,
  ItemProgressData,
} from '@lms/contracts';
import type { Response } from 'express';
import { apiError, ApiExceptionFilter } from '../../common/api-error';
import { requestId } from '../../common/request-context';
import { validateRequest } from '../../common/validate-request';
import { CompleteItemRequestPipe } from './dto/complete-item-request.pipe';
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
        validateRequest('Uuid', id),
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
        validateRequest('Uuid', id),
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
        validateRequest('Uuid', id),
        body,
        context,
      ),
      meta: { requestId: context.requestId },
    };
  }
}
