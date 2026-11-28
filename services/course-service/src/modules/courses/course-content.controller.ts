import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { CurrentUser } from '@lms/auth';
import type {
  ApiResponse,
  AuthUser,
  ChapterData,
  LessonData,
  LearningItemData,
} from '@lms/contracts';
import type { Request } from 'express';
import { CourseAuthGuard } from '../../common/course-auth.guard';
import { CoursesService } from './courses.service';
import { validateCourseId } from './dto/course-request.pipe';
import { validateChapterId } from '../chapters/dto/chapter-request.pipe';
import { validateLessonId } from '../lessons/dto/lesson-request.pipe';

@Controller('api/v1')
@UseGuards(CourseAuthGuard)
export class CourseContentController {
  constructor(private readonly courses: CoursesService) {}

  @Get('courses/:id/chapters')
  async chapters(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
  ): Promise<ApiResponse<ChapterData[]>> {
    return {
      data: await this.courses.listChapters(validateCourseId(id), user),
      meta: { requestId: String(request.headers['x-request-id']) },
    };
  }

  @Get('chapters/:id/lessons')
  async lessons(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
  ): Promise<ApiResponse<LessonData[]>> {
    return {
      data: await this.courses.listLessons(validateChapterId(id), user),
      meta: { requestId: String(request.headers['x-request-id']) },
    };
  }

  @Get('lessons/:id/learning-items')
  async learningItems(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
  ): Promise<ApiResponse<LearningItemData[]>> {
    return {
      data: await this.courses.listLearningItems(validateLessonId(id), user),
      meta: { requestId: String(request.headers['x-request-id']) },
    };
  }
}
