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
  CreateLessonRequest,
  LessonData,
  ReorderRequest,
  UpdateLessonRequest,
  VersionRequest,
} from '@lms/contracts';
import type { Request } from 'express';
import { validateChapterId } from '../chapters/dto/chapter-request.pipe';
import { LessonsService } from './lessons.service';
import {
  CreateLessonPipe,
  LessonVersionRequestPipe,
  ReorderLessonPipe,
  UpdateLessonPipe,
  validateLessonId,
} from './dto/lesson-request.pipe';

@Controller('api/v1')
@UseGuards(MockAuthGuard)
export class LessonsController {
  constructor(private readonly lessons: LessonsService) {}

  @Post('chapters/:id/lessons')
  async create(
    @Param('id') chapterId: string,
    @Body(CreateLessonPipe) body: CreateLessonRequest,
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
  ): Promise<ApiResponse<LessonData>> {
    return { data: await this.lessons.create(validateChapterId(chapterId), body, user), meta: { requestId: String(request.headers['x-request-id']) } };
  }

  @Patch('lessons/:id')
  async update(
    @Param('id') id: string,
    @Body(UpdateLessonPipe) body: UpdateLessonRequest,
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
  ): Promise<ApiResponse<LessonData>> {
    return { data: await this.lessons.update(validateLessonId(id), body, user), meta: { requestId: String(request.headers['x-request-id']) } };
  }

  @Delete('lessons/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id') id: string,
    @Body(LessonVersionRequestPipe) body: VersionRequest,
    @CurrentUser() user: AuthUser,
  ): Promise<void> {
    await this.lessons.remove(validateLessonId(id), body, user);
  }

  @Put('chapters/:id/lessons/order')
  async reorder(
    @Param('id') chapterId: string,
    @Body(ReorderLessonPipe) body: ReorderRequest,
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
  ): Promise<ApiResponse<LessonData[]>> {
    return { data: await this.lessons.reorder(validateChapterId(chapterId), body, user), meta: { requestId: String(request.headers['x-request-id']) } };
  }
}
