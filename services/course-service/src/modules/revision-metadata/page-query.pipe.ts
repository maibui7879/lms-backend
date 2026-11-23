import { BadRequestException } from '@nestjs/common';
import type { PipeTransform } from '@nestjs/common';
import { ContractValidationError, parseContract } from '@lms/contracts';
import type { PageQuery } from '@lms/contracts';

export class PageQueryPipe implements PipeTransform<unknown, PageQuery> {
  transform(value: unknown): PageQuery {
    const input =
      value && typeof value === 'object'
        ? { ...(value as Record<string, unknown>) }
        : {};
    for (const key of ['page', 'limit']) {
      if (input[key] === undefined) continue;
      if (
        typeof input[key] !== 'string' ||
        !/^[1-9]\d*$/.test(input[key] as string)
      )
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'Pagination must use positive decimal integers',
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
