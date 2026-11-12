import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser, MockAuthGuard } from '@lms/auth';
import type {
  ApiResponse,
  AuthUser,
  CourseOutlineData,
  CreateLearningItemRequest,
  LearningItemData,
  ReorderRequest,
  UpdateLearningItemRequest,
  VersionRequest,
} from '@lms/contracts';
import type { Request } from 'express';
import { validateLessonId } from '../lessons/dto/lesson-request.pipe';
import { LearningItemsService } from './learning-items.service';
import {
  CreateLearningItemPipe,
  LearningItemVersionRequestPipe,
  ReorderLearningItemPipe,
  UpdateLearningItemPipe,
  validateLearningItemId,
} from './dto/learning-item-request.pipe';

@Controller('api/v1')
@UseGuards(MockAuthGuard)
export class LearningItemsController {
  constructor(private readonly learningItems: LearningItemsService) {}

  @Post('lessons/:id/items')
  async create(
    @Param('id') lessonId: string,
    @Body(CreateLearningItemPipe) body: CreateLearningItemRequest,
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
  ): Promise<ApiResponse<LearningItemData>> {
    return {
      data: await this.learningItems.create(
        validateLessonId(lessonId),
        body,
        user,
      ),
      meta: { requestId: String(request.headers['x-request-id']) },
    };
  }

  @Patch('learning-items/:id')
  async update(
    @Param('id') id: string,
    @Body(UpdateLearningItemPipe) body: UpdateLearningItemRequest,
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
  ): Promise<ApiResponse<LearningItemData>> {
    return {
      data: await this.learningItems.update(
        validateLearningItemId(id),
        body,
        user,
      ),
      meta: { requestId: String(request.headers['x-request-id']) },
    };
  }

  @Delete('learning-items/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id') id: string,
    @Body(LearningItemVersionRequestPipe) body: VersionRequest,
    @CurrentUser() user: AuthUser,
  ): Promise<void> {
    await this.learningItems.remove(validateLearningItemId(id), body, user);
  }

  @Put('lessons/:id/items/order')
  async reorder(
    @Param('id') lessonId: string,
    @Body(ReorderLearningItemPipe) body: ReorderRequest,
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
  ): Promise<ApiResponse<CourseOutlineData>> {
    return {
      data: await this.learningItems.reorder(
        validateLessonId(lessonId),
        body,
        user,
      ),
      meta: { requestId: String(request.headers['x-request-id']) },
    };
  }
}
