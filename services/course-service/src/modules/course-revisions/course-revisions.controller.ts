import {
  Body,
  Controller,
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
  CourseData,
  CourseRevisionData,
  CourseReviewData,
  CreateCourseRevisionRequest,
  PageData,
  PageQuery,
  ReviewCourseRequest,
  ReviewCourseRevisionRequest,
  VersionRequest,
} from '@lms/contracts';
import type { Request } from 'express';
import {
  VersionRequestPipe,
  validateCourseId,
} from '../courses/dto/course-request.pipe';
import {
  CourseReviewRequestPipe,
  CreateCourseRevisionPipe,
  ReviewCourseRevisionPipe,
  RevisionVersionPipe,
  ReviewQueueQueryPipe,
} from './dto/course-review-request.pipe';
import { CourseRevisionsService } from './course-revisions.service';

@Controller('api/v1')
export class CourseRevisionsController {
  constructor(private readonly revisions: CourseRevisionsService) {}

  @Post('courses/:id/revisions')
  @UseGuards(MockAuthGuard)
  async createRevision(
    @Param('id') id: string,
    @Body(CreateCourseRevisionPipe) body: CreateCourseRevisionRequest,
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
  ): Promise<ApiResponse<CourseRevisionData>> {
    return {
      data: await this.revisions.createRevision(
        validateCourseId(id),
        body,
        user,
      ),
      meta: { requestId: String(request.headers['x-request-id']) },
    };
  }

  @Get('courses/:id/revisions')
  @UseGuards(MockAuthGuard)
  async listRevisions(
    @Param('id') id: string,
    @Query(new ReviewQueueQueryPipe()) query: PageQuery,
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
  ): Promise<ApiResponse<PageData<CourseRevisionData>>> {
    return {
      data: await this.revisions.listRevisions(
        validateCourseId(id),
        query,
        user,
      ),
      meta: { requestId: String(request.headers['x-request-id']) },
    };
  }

  @Get('course-revisions/:id')
  @UseGuards(MockAuthGuard)
  async getRevision(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
  ): Promise<ApiResponse<CourseRevisionData>> {
    return {
      data: await this.revisions.getRevision(id, user),
      meta: { requestId: String(request.headers['x-request-id']) },
    };
  }

  @Post('course-revisions/:id/submit-review')
  @HttpCode(HttpStatus.OK)
  @UseGuards(MockAuthGuard)
  async submitRevision(
    @Param('id') id: string,
    @Body(RevisionVersionPipe) body: VersionRequest,
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
  ): Promise<ApiResponse<CourseRevisionData>> {
    return {
      data: await this.revisions.submitRevision(id, body, user),
      meta: { requestId: String(request.headers['x-request-id']) },
    };
  }

  @Post('admin/course-revisions/:id/review')
  @HttpCode(HttpStatus.OK)
  @UseGuards(MockAuthGuard)
  async reviewRevision(
    @Param('id') id: string,
    @Body(ReviewCourseRevisionPipe) body: ReviewCourseRevisionRequest,
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
  ): Promise<ApiResponse<CourseRevisionData>> {
    return {
      data: await this.revisions.reviewRevision(id, body, user),
      meta: { requestId: String(request.headers['x-request-id']) },
    };
  }

  @Post('courses/:id/submit-review')
  @HttpCode(HttpStatus.OK)
  @UseGuards(MockAuthGuard)
  async submit(
    @Param('id') id: string,
    @Body(new VersionRequestPipe()) body: VersionRequest,
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
  ): Promise<ApiResponse<CourseData>> {
    return {
      data: await this.revisions.submit(validateCourseId(id), body, user),
      meta: { requestId: String(request.headers['x-request-id']) },
    };
  }

  @Get('admin/courses/review-queue')
  @UseGuards(MockAuthGuard)
  async reviewQueue(
    @Query(new ReviewQueueQueryPipe()) query: PageQuery,
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
  ): Promise<ApiResponse<PageData<CourseData>>> {
    return {
      data: await this.revisions.reviewQueue(query, user),
      meta: { requestId: String(request.headers['x-request-id']) },
    };
  }

  @Post('admin/courses/:id/review')
  @HttpCode(HttpStatus.OK)
  @UseGuards(MockAuthGuard)
  async review(
    @Param('id') id: string,
    @Body(new CourseReviewRequestPipe()) body: ReviewCourseRequest,
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
  ): Promise<ApiResponse<CourseReviewData>> {
    return {
      data: await this.revisions.review(validateCourseId(id), body, user),
      meta: { requestId: String(request.headers['x-request-id']) },
    };
  }

  @Get('courses/:id/reviews')
  @UseGuards(MockAuthGuard)
  async listReviews(
    @Param('id') id: string,
    @Query(new ReviewQueueQueryPipe()) query: PageQuery,
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
  ): Promise<ApiResponse<PageData<CourseReviewData>>> {
    return {
      data: await this.revisions.listReviews(validateCourseId(id), query, user),
      meta: { requestId: String(request.headers['x-request-id']) },
    };
  }
}
