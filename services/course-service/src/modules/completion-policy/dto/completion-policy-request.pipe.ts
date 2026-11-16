import { BadRequestException } from '@nestjs/common';
import type { PipeTransform } from '@nestjs/common';
import { ContractValidationError, parseContract } from '@lms/contracts';
import type { UpdateCompletionPolicyRequest } from '@lms/contracts';

export class UpdateCompletionPolicyPipe implements PipeTransform<
  unknown,
  UpdateCompletionPolicyRequest
> {
  transform(value: unknown): UpdateCompletionPolicyRequest {
    try {
      return parseContract('UpdateCompletionPolicyRequest', value);
    } catch (error) {
      if (error instanceof ContractValidationError)
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'Invalid completion policy payload',
          details: { issues: error.issues },
        });
      throw error;
    }
  }
}
