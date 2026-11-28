import { BadRequestException, Injectable } from '@nestjs/common';
import type { PipeTransform } from '@nestjs/common';
import { ContractValidationError, parseContract } from '@lms/contracts';
import type {
  CreateQuizRequest,
  UpdateQuizRequest,
  VersionRequest,
} from '@lms/contracts';

export function validateCreateQuiz(payload: unknown): CreateQuizRequest {
  try {
    return parseContract('CreateQuizRequest', payload);
  } catch (error) {
    if (error instanceof ContractValidationError)
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Invalid quiz payload',
        details: { issues: error.issues },
      });
    throw error;
  }
}

@Injectable()
export class CreateQuizPipe implements PipeTransform<
  unknown,
  CreateQuizRequest
> {
  transform(value: unknown): CreateQuizRequest {
    return validateCreateQuiz(value);
  }
}

@Injectable()
export class UpdateQuizPipe implements PipeTransform<
  unknown,
  UpdateQuizRequest
> {
  transform(value: unknown): UpdateQuizRequest {
    try {
      return parseContract('UpdateQuizRequest', value);
    } catch (error) {
      if (error instanceof ContractValidationError)
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'Invalid quiz payload',
          details: { issues: error.issues },
        });
      throw error;
    }
  }
}

@Injectable()
export class DeleteQuizPipe implements PipeTransform<unknown, VersionRequest> {
  transform(value: unknown): VersionRequest {
    try {
      return parseContract('VersionRequest', value);
    } catch (error) {
      if (error instanceof ContractValidationError)
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'Invalid quiz version',
          details: { issues: error.issues },
        });
      throw error;
    }
  }
}

@Injectable()
export class PublishQuizPipe implements PipeTransform<unknown, VersionRequest> {
  transform(value: unknown): VersionRequest {
    try {
      return parseContract('VersionRequest', value);
    } catch (error) {
      if (error instanceof ContractValidationError)
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'Invalid quiz version',
          details: { issues: error.issues },
        });
      throw error;
    }
  }
}
