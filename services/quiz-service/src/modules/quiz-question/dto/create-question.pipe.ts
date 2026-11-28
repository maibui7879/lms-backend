import { BadRequestException, Injectable } from '@nestjs/common';
import type { PipeTransform } from '@nestjs/common';
import { ContractValidationError, parseContract } from '@lms/contracts';
import type {
  CreateQuestionRequest,
  PageQuery,
  UpdateQuestionRequest,
  VersionRequest,
} from '@lms/contracts';
// Pipe là đoạn code kiểm tra dữ liệu trước khi chuyển cho phần xử lý trính
@Injectable()
export class CreateQuestionPipe implements PipeTransform<
  unknown,
  CreateQuestionRequest
> {
  transform(value: unknown): CreateQuestionRequest {
    try {
      return parseContract('CreateQuestionRequest', value);
    } catch (error) {
      if (error instanceof ContractValidationError)
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'Invalid question payload',
          details: { issues: error.issues },
        });
      throw error;
    }
  }
}

@Injectable()
export class UpdateQuestionPipe implements PipeTransform<
  unknown,
  UpdateQuestionRequest
> {
  transform(value: unknown): UpdateQuestionRequest {
    try {
      return parseContract('UpdateQuestionRequest', value);
    } catch (error) {
      if (error instanceof ContractValidationError)
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'Invalid question payload',
          details: { issues: error.issues },
        });
      throw error;
    }
  }
}

@Injectable()
export class DeleteQuestionPipe implements PipeTransform<
  unknown,
  VersionRequest
> {
  transform(value: unknown): VersionRequest {
    try {
      return parseContract('VersionRequest', value);
    } catch (error) {
      if (error instanceof ContractValidationError)
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'Invalid question version',
          details: { issues: error.issues },
        });
      throw error;
    }
  }
}

@Injectable()
export class QuestionPageQueryPipe implements PipeTransform<
  unknown,
  PageQuery
> {
  transform(value: unknown): PageQuery {
    const input =
      value && typeof value === 'object'
        ? { ...(value as Record<string, unknown>) }
        : {};
    for (const key of ['page', 'limit']) {
      if (input[key] === undefined) continue;
      if (
        typeof input[key] !== 'string' ||
        !/^[1-9]\d*$/.test(input[key] as string) ||
        !Number.isSafeInteger(Number(input[key]))
      )
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'Invalid pagination query',
          details: {},
        });
      input[key] = Number(input[key]);
    }
    try {
      return parseContract('PageQuery', input);
    } catch (error) {
      if (error instanceof ContractValidationError)
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'Invalid pagination query',
          details: { issues: error.issues },
        });
      throw error;
    }
  }
}
