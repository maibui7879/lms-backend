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
  ChapterData,
  CourseOutlineData,
  CreateChapterRequest,
  ReorderRequest,
  UpdateChapterRequest,
  VersionRequest,
} from '@lms/contracts';
import type { Request } from 'express';
import { ChaptersService } from './chapters.service';
import {
  ChapterVersionRequestPipe,
  CreateChapterPipe,
  ReorderChapterPipe,
  UpdateChapterPipe,
  validateChapterId,
} from './dto/chapter-request.pipe';
import { validateCourseId } from '../courses/dto/course-request.pipe';

@Controller('api/v1')
@UseGuards(MockAuthGuard)
export class ChaptersController {
  constructor(private readonly chapters: ChaptersService) {}

  @Post('courses/:id/chapters')
  async create(
    @Param('id') courseId: string,
    @Body(CreateChapterPipe) body: CreateChapterRequest,
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
  ): Promise<ApiResponse<ChapterData>> {
    return {
      data: await this.chapters.create(validateCourseId(courseId), body, user),
      meta: { requestId: String(request.headers['x-request-id']) },
    };
  }

  @Patch('chapters/:id')
  async update(
    @Param('id') id: string,
    @Body(UpdateChapterPipe) body: UpdateChapterRequest,
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
  ): Promise<ApiResponse<ChapterData>> {
    return {
      data: await this.chapters.update(validateChapterId(id), body, user),
      meta: { requestId: String(request.headers['x-request-id']) },
    };
  }

  @Delete('chapters/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id') id: string,
    @Body(ChapterVersionRequestPipe) body: VersionRequest,
    @CurrentUser() user: AuthUser,
  ): Promise<void> {
    await this.chapters.remove(validateChapterId(id), body, user);
  }

  @Put('courses/:id/chapters/order')
  async reorder(
    @Param('id') courseId: string,
    @Body(ReorderChapterPipe) body: ReorderRequest,
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
  ): Promise<ApiResponse<CourseOutlineData>> {
    return {
      data: await this.chapters.reorder(validateCourseId(courseId), body, user),
      meta: { requestId: String(request.headers['x-request-id']) },
    };
  }
}
