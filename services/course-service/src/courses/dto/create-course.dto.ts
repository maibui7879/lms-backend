import { BadRequestException, Injectable } from '@nestjs/common';
import type { PipeTransform } from '@nestjs/common';
import { ContractValidationError, parseContract } from '@lms/contracts';
import type { CreateCourseRequest } from '@lms/contracts';

export function validateCreateCourse(payload: unknown): CreateCourseRequest {
  try {
    return parseContract('CreateCourseRequest', payload);
  } catch (error) {
    if (error instanceof ContractValidationError)
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Invalid course payload',
        details: { issues: error.issues },
      });
    throw error;
  }
}
@Injectable()
export class CreateCoursePipe implements PipeTransform<
  unknown,
  CreateCourseRequest
> {
  transform(value: unknown): CreateCourseRequest {
    return validateCreateCourse(value);
  }
}
