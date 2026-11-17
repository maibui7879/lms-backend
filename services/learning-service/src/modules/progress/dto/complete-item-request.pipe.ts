import { Injectable } from '@nestjs/common';
import type { PipeTransform } from '@nestjs/common';
import type { CompleteItemRequest } from '@lms/contracts';
import { validateRequest } from '../../../common/validate-request';

@Injectable()
export class CompleteItemRequestPipe implements PipeTransform<
  unknown,
  CompleteItemRequest
> {
  transform(value: unknown): CompleteItemRequest {
    return validateRequest('CompleteItemRequest', value);
  }
}
