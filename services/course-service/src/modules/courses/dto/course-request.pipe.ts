import { BadRequestException } from '@nestjs/common';
import type { PipeTransform } from '@nestjs/common';
import { ContractValidationError, parseContract } from '@lms/contracts';
import type {
  CourseQuery,
  InstructorCourseQuery,
  UpdateCourseRequest,
  VersionRequest,
} from '@lms/contracts';

function validationError(error: unknown): never {
  if (error instanceof ContractValidationError)
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'Invalid course payload',
      details: { issues: error.issues },
    });
  throw error;
}

export class UpdateCoursePipe implements PipeTransform<
  unknown,
  UpdateCourseRequest
> {
  transform(value: unknown): UpdateCourseRequest {
    try {
      return parseContract('UpdateCourseRequest', value);
    } catch (error) {
      return validationError(error);
    }
  }
}

export class VersionRequestPipe implements PipeTransform<
  unknown,
  VersionRequest
> {
  transform(value: unknown): VersionRequest {
    try {
      return parseContract('VersionRequest', value);
    } catch (error) {
      return validationError(error);
    }
  }
}

export class CourseQueryPipe implements PipeTransform<unknown, CourseQuery> {
  transform(value: unknown): CourseQuery {
    const input =
      value && typeof value === 'object'
        ? { ...(value as Record<string, unknown>) }
        : {};
    for (const key of ['page', 'limit']) {
      if (typeof input[key] === 'string' && input[key] !== '')
        input[key] = Number(input[key]);
    }
    try {
      return parseContract('CourseQuery', input);
    } catch (error) {
      return validationError(error);
    }
  }
}

export class InstructorCourseQueryPipe implements PipeTransform<
  unknown,
  InstructorCourseQuery
> {
  transform(value: unknown): InstructorCourseQuery {
    const input =
      value && typeof value === 'object'
        ? { ...(value as Record<string, unknown>) }
        : {};
    for (const key of ['page', 'limit']) {
      if (typeof input[key] === 'string' && input[key] !== '')
        input[key] = Number(input[key]);
    }
    try {
      return parseContract('InstructorCourseQuery', input);
    } catch (error) {
      return validationError(error);
    }
  }
}

export function validateCourseId(value: string): string {
  try {
    parseContract('CourseData', {
      id: value,
      instructorId: '00000000-0000-4000-8000-000000000000',
      title: 'placeholder',
      description: '',
      thumbnailUrl: null,
      status: 'DRAFT',
      version: 1,
      contentVersion: 1,
      createdAt: '2020-01-01T00:00:00Z',
      updatedAt: '2020-01-01T00:00:00Z',
    });
    return value;
  } catch {
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'Invalid course id',
      details: { issues: ['/id must be a valid UUID'] },
    });
  }
}
