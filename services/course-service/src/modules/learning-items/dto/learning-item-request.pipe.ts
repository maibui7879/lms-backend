import { BadRequestException } from '@nestjs/common';
import type { PipeTransform } from '@nestjs/common';
import { ContractValidationError, parseContract } from '@lms/contracts';
import type {
  CreateLearningItemRequest,
  RevisionReorderRequest,
  UpdateLearningItemRequest,
  RevisionVersionRequest,
} from '@lms/contracts';

function validationError(error: unknown): never {
  if (error instanceof ContractValidationError)
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'Invalid learning item payload',
      details: { issues: error.issues },
    });
  throw error;
}

export class CreateLearningItemPipe implements PipeTransform<
  unknown,
  CreateLearningItemRequest
> {
  transform(value: unknown): CreateLearningItemRequest {
    try {
      return parseContract('CreateLearningItemRequest', value);
    } catch (error) {
      return validationError(error);
    }
  }
}

export class UpdateLearningItemPipe implements PipeTransform<
  unknown,
  UpdateLearningItemRequest
> {
  transform(value: unknown): UpdateLearningItemRequest {
    try {
      return parseContract('UpdateLearningItemRequest', value);
    } catch (error) {
      return validationError(error);
    }
  }
}

export class ReorderLearningItemPipe implements PipeTransform<
  unknown,
  RevisionReorderRequest
> {
  transform(value: unknown): RevisionReorderRequest {
    try {
      return parseContract('RevisionReorderRequest', value);
    } catch (error) {
      return validationError(error);
    }
  }
}

export class LearningItemVersionRequestPipe implements PipeTransform<
  unknown,
  RevisionVersionRequest
> {
  transform(value: unknown): RevisionVersionRequest {
    try {
      return parseContract('RevisionVersionRequest', value);
    } catch (error) {
      return validationError(error);
    }
  }
}

export function validateLearningItemId(value: string): string {
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[4-9][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    return value;
  throw new BadRequestException({
    code: 'VALIDATION_ERROR',
    message: 'Invalid learning item id',
    details: { issues: ['/id must be a valid UUID'] },
  });
}
