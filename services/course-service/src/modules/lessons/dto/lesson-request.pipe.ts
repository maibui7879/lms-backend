import { BadRequestException } from '@nestjs/common';
import type { PipeTransform } from '@nestjs/common';
import { ContractValidationError, parseContract } from '@lms/contracts';
import type {
  CreateLessonRequest,
  ReorderRequest,
  UpdateLessonRequest,
  VersionRequest,
} from '@lms/contracts';

function validationError(error: unknown): never {
  if (error instanceof ContractValidationError)
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'Invalid lesson payload',
      details: { issues: error.issues },
    });
  throw error;
}

export class CreateLessonPipe implements PipeTransform<
  unknown,
  CreateLessonRequest
> {
  transform(value: unknown): CreateLessonRequest {
    try {
      return parseContract('CreateLessonRequest', value);
    } catch (error) {
      return validationError(error);
    }
  }
}

export class UpdateLessonPipe implements PipeTransform<
  unknown,
  UpdateLessonRequest
> {
  transform(value: unknown): UpdateLessonRequest {
    try {
      return parseContract('UpdateLessonRequest', value);
    } catch (error) {
      return validationError(error);
    }
  }
}

export class ReorderLessonPipe implements PipeTransform<
  unknown,
  ReorderRequest
> {
  transform(value: unknown): ReorderRequest {
    try {
      return parseContract('ReorderRequest', value);
    } catch (error) {
      return validationError(error);
    }
  }
}

export class LessonVersionRequestPipe implements PipeTransform<
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

export function validateLessonId(value: string): string {
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[4-9][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    return value;
  throw new BadRequestException({
    code: 'VALIDATION_ERROR',
    message: 'Invalid lesson id',
    details: { issues: ['/id must be a valid UUID'] },
  });
}
