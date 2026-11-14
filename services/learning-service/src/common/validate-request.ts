import { ContractValidationError, parseContract } from '@lms/contracts';
import { apiError } from './api-error';

export function validateRequest<K extends Parameters<typeof parseContract>[0]>(
  schema: K,
  value: unknown,
) {
  try {
    return parseContract(schema, value);
  } catch (error) {
    if (!(error instanceof ContractValidationError)) throw error;
    throw apiError('VALIDATION_ERROR', 'Invalid learning request', {
      issues: error.issues,
    });
  }
}
