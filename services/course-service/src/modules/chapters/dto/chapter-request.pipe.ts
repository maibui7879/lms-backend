import { BadRequestException } from '@nestjs/common';
import type { PipeTransform } from '@nestjs/common';
import { ContractValidationError, parseContract } from '@lms/contracts';
import type {
  CreateChapterRequest,
  ReorderRequest,
  UpdateChapterRequest,
  VersionRequest,
} from '@lms/contracts';

function validationError(error: unknown): never {
  if (error instanceof ContractValidationError)
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'Invalid chapter payload',
      details: { issues: error.issues },
    });
  throw error;
}

export class CreateChapterPipe implements PipeTransform<
  unknown,
  CreateChapterRequest
> {
  transform(value: unknown): CreateChapterRequest {
    try {
      return parseContract('CreateChapterRequest', value);
    } catch (error) {
      return validationError(error);
    }
  }
}

export class UpdateChapterPipe implements PipeTransform<
  unknown,
  UpdateChapterRequest
> {
  transform(value: unknown): UpdateChapterRequest {
    try {
      return parseContract('UpdateChapterRequest', value);
    } catch (error) {
      return validationError(error);
    }
  }
}

export class ReorderChapterPipe implements PipeTransform<
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

export class ChapterVersionRequestPipe implements PipeTransform<
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

export function validateChapterId(value: string): string {
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[4-9][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    return value;
  throw new BadRequestException({
    code: 'VALIDATION_ERROR',
    message: 'Invalid chapter id',
    details: { issues: ['/id must be a valid UUID'] },
  });
}
