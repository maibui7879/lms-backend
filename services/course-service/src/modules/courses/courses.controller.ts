import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '@lms/auth';
import { CourseAuthGuard } from '../../common/course-auth.guard';
import type {
  ApiResponse,
  AuthUser,
  CourseQuery,
  CourseData,
  CourseLearnerData,
  CourseOutlineData,
  CreateCourseRequest,
  PageData,
  PageQuery,
  InstructorCourseQuery,
  UpdateCourseRequest,
  VersionRequest,
} from '@lms/contracts';
import type { Request } from 'express';
import { CoursesService } from './courses.service';
import { CreateCoursePipe } from './dto/create-course.dto';
import {
  CourseQueryPipe,
  InstructorCourseQueryPipe,
  UpdateCoursePipe,
  VersionRequestPipe,
  validateCourseId,
} from './dto/course-request.pipe';

@Controller('api/v1/courses')
export class CoursesController {
  constructor(private readonly courses: CoursesService) {}
  @Post()
  @UseGuards(CourseAuthGuard)
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

  @Get()
  async list(
    @Query(new CourseQueryPipe()) query: CourseQuery,
    @Req() request: Request,
  ): Promise<ApiResponse<PageData<CourseData>>> {
    return {
      data: await this.courses.list(query),
      meta: { requestId: String(request.headers['x-request-id']) },
    };
  }

  @Get(':id/outline')
  @UseGuards(CourseAuthGuard)
  async outline(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
  ): Promise<ApiResponse<CourseOutlineData>> {
    return {
      data: await this.courses.outline(validateCourseId(id), user),
      meta: { requestId: String(request.headers['x-request-id']) },
    };
  }

  @Get(':id/learners')
  @UseGuards(CourseAuthGuard)
  async learners(
    @Param('id') id: string,
    @Query(new CourseQueryPipe()) query: PageQuery,
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
  ): Promise<ApiResponse<PageData<CourseLearnerData>>> {
    return {
      data: await this.courses.listLearners(validateCourseId(id), query, user),
      meta: { requestId: String(request.headers['x-request-id']) },
    };
  }

  @Get(':id')
  async get(
    @Param('id') id: string,
    @Req() request: Request,
  ): Promise<ApiResponse<CourseData>> {
    return {
      data: await this.courses.get(validateCourseId(id)),
      meta: { requestId: String(request.headers['x-request-id']) },
    };
  }

  @Patch(':id')
  @UseGuards(CourseAuthGuard)
  async update(
    @Param('id') id: string,
    @Body(new UpdateCoursePipe()) body: UpdateCourseRequest,
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
  ): Promise<ApiResponse<CourseData>> {
    return {
      data: await this.courses.update(validateCourseId(id), body, user),
      meta: { requestId: String(request.headers['x-request-id']) },
    };
  }

  @Delete(':id')
  @UseGuards(CourseAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id') id: string,
    @Body(new VersionRequestPipe()) body: VersionRequest,
    @CurrentUser() user: AuthUser,
  ): Promise<void> {
    await this.courses.remove(validateCourseId(id), body, user);
  }
}

@Controller('api/v1/instructor')
export class InstructorCoursesController {
  constructor(private readonly courses: CoursesService) {}

  @Get('courses/:id')
  @UseGuards(CourseAuthGuard)
  async get(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
  ): Promise<ApiResponse<CourseData>> {
    return {
      data: await this.courses.getInstructorCourse(validateCourseId(id), user),
      meta: { requestId: String(request.headers['x-request-id']) },
    };
  }

  @Get('courses')
  @UseGuards(CourseAuthGuard)
  async list(
    @Query(new InstructorCourseQueryPipe()) query: InstructorCourseQuery,
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
  ): Promise<ApiResponse<PageData<CourseData>>> {
    return {
      data: await this.courses.listInstructorCourses(query, user),
      meta: { requestId: String(request.headers['x-request-id']) },
    };
  }
}
