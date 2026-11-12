import { BadRequestException } from '@nestjs/common';
import type { PipeTransform } from '@nestjs/common';
import { ContractValidationError, parseContract } from '@lms/contracts';
import type { PageQuery, ReviewCourseRequest } from '@lms/contracts';

function validationError(error: unknown): never {
  if (error instanceof ContractValidationError)
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'Invalid course review payload',
      details: { issues: error.issues },
    });
  throw error;
}

export class CourseReviewRequestPipe implements PipeTransform<
  unknown,
  ReviewCourseRequest
> {
  transform(value: unknown): ReviewCourseRequest {
    try {
      return parseContract('ReviewCourseRequest', value);
    } catch (error) {
      return validationError(error);
    }
  }
}

export class ReviewQueueQueryPipe implements PipeTransform<unknown, PageQuery> {
  transform(value: unknown): PageQuery {
    const input =
      value && typeof value === 'object'
        ? { ...(value as Record<string, unknown>) }
        : {};
    for (const key of ['page', 'limit']) {
      if (typeof input[key] === 'string' && input[key] !== '')
        input[key] = Number(input[key]);
    }
    try {
      return parseContract('PageQuery', input);
    } catch (error) {
      return validationError(error);
    }
  }
}
