import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser, MockAuthGuard } from '@lms/auth';
import type {
  ApiResponse,
  AuthUser,
  EnrollmentCheckData,
  EnrollmentSnapshotData,
  EnrolledCourseData,
  PageData,
  PageQuery,
} from '@lms/contracts';
import type { Request } from 'express';
import { EnrollmentsService } from './enrollments.service';
import { EnrollmentQueryPipe } from './dto/enrollment-query.pipe';
import { validateCourseId } from '../courses/dto/course-request.pipe';

@Controller('api/v1')
export class EnrollmentsController {
  constructor(private readonly enrollments: EnrollmentsService) {}

  @Post('courses/:id/enrollments')
  @UseGuards(MockAuthGuard)
  async create(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
  ): Promise<ApiResponse<EnrollmentSnapshotData>> {
    return {
      data: await this.enrollments.create(validateCourseId(id), user),
      meta: { requestId: String(request.headers['x-request-id']) },
    };
  }

  @Get('enrollments/me')
  @UseGuards(MockAuthGuard)
  async listMine(
    @Query(new EnrollmentQueryPipe()) query: PageQuery,
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
  ): Promise<ApiResponse<PageData<EnrolledCourseData>>> {
    return {
      data: await this.enrollments.listMine(user, query),
      meta: { requestId: String(request.headers['x-request-id']) },
    };
  }

  @Delete('enrollments/:id')
  @UseGuards(MockAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async cancel(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<void> {
    await this.enrollments.cancel(id, user);
  }
}
