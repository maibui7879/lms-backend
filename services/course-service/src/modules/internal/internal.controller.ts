import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  Req,
} from '@nestjs/common';
import type {
  ApiResponse,
  ContentVersionQuery,
  CourseAccessData,
  CourseAccessQuery,
  CourseContentReference,
  CourseLearningStructure,
  EnrollmentCheckData,
  EnrollmentCheckQuery,
} from '@lms/contracts';
import { ContractValidationError, parseContract } from '@lms/contracts';
import type { Request } from 'express';
import { EnrollmentsService } from '../enrollments/enrollments.service';
import { InternalService } from './internal.service';
import { validateCourseId } from '../courses/dto/course-request.pipe';

@Controller('api/v1/internal')
export class InternalController {
  constructor(
    private readonly enrollments: EnrollmentsService,
    private readonly internal: InternalService,
  ) {}

  @Get('courses/access')
  async checkCourseAccess(
    @Query() query: Record<string, unknown>,
    @Req() request: Request,
  ): Promise<ApiResponse<CourseAccessData>> {
    return {
      data: await this.internal.checkCourseAccess(
        this.parseQuery<CourseAccessQuery>('CourseAccessQuery', query),
      ),
      meta: { requestId: String(request.headers['x-request-id']) },
    };
  }

  @Get('quizzes/:id/reference')
  async getContentReference(
    @Param('id') id: string,
    @Req() request: Request,
  ): Promise<ApiResponse<CourseContentReference>> {
    return {
      data: await this.internal.getContentReference(validateCourseId(id)),
      meta: { requestId: String(request.headers['x-request-id']) },
    };
  }

  @Get('courses/:id/structure')
  async getLearningStructure(
    @Param('id') id: string,
    @Query() query: Record<string, unknown>,
    @Req() request: Request,
  ): Promise<ApiResponse<CourseLearningStructure>> {
    return {
      data: await this.internal.getLearningStructure(
        validateCourseId(id),
        this.parseQuery<ContentVersionQuery>('ContentVersionQuery', query),
      ),
      meta: { requestId: String(request.headers['x-request-id']) },
    };
  }

  private parseQuery<T>(
    name: 'CourseAccessQuery' | 'ContentVersionQuery',
    query: Record<string, unknown>,
  ): T {
    try {
      return parseContract(name, query) as T;
    } catch (error) {
      if (error instanceof ContractValidationError)
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'Invalid internal query',
          details: { issues: error.issues },
        });
      throw error;
    }
  }

  @Get('enrollments/check')
  async checkEnrollment(
    @Query() query: Record<string, unknown>,
    @Req() request: Request,
  ): Promise<ApiResponse<EnrollmentCheckData>> {
    let input: EnrollmentCheckQuery;
    try {
      input = parseContract('EnrollmentCheckQuery', query);
    } catch (error) {
      if (error instanceof ContractValidationError)
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'Invalid enrollment query',
          details: { issues: error.issues },
        });
      throw error;
    }
    return {
      data: await this.enrollments.check(input.userId, input.courseId),
      meta: { requestId: String(request.headers['x-request-id']) },
    };
  }
}
