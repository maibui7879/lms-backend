import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Req,
} from '@nestjs/common';
import type {
  ApiResponse,
  EnrollmentCheckData,
  EnrollmentCheckQuery,
} from '@lms/contracts';
import { ContractValidationError, parseContract } from '@lms/contracts';
import type { Request } from 'express';
import { EnrollmentsService } from '../enrollments/enrollments.service';

@Controller('api/v1/internal')
export class InternalController {
  constructor(private readonly enrollments: EnrollmentsService) {}

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
