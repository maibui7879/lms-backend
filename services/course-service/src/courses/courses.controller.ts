import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { CurrentUser, MockAuthGuard } from '@lms/auth';
import type {
  ApiResponse,
  AuthUser,
  CourseData,
  CreateCourseRequest,
} from '@lms/contracts';
import type { Request } from 'express';
import { CoursesService } from './courses.service';
import { CreateCoursePipe } from './dto/create-course.dto';

@Controller('api/v1/courses')
@UseGuards(MockAuthGuard)
export class CoursesController {
  constructor(private readonly courses: CoursesService) {}
  @Post()
  async create(
    @Body(CreateCoursePipe) body: CreateCourseRequest,
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
  ): Promise<ApiResponse<CourseData>> {
    return {
      data: await this.courses.create(body, user),
      meta: { requestId: String(request.headers['x-request-id']) },
    };
  }
}
