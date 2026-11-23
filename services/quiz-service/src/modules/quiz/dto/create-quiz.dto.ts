import { BadRequestException, Injectable } from '@nestjs/common';
import type { PipeTransform } from '@nestjs/common';
import { ContractValidationError, parseContract } from '@lms/contracts';
import type { CreateQuizRequest } from '@lms/contracts';

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
