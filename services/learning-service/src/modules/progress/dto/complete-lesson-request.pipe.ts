import { Injectable } from '@nestjs/common';
import type { PipeTransform } from '@nestjs/common';
import type { CompleteLessonRequest } from '@lms/contracts';
import { validateRequest } from '../../../common/validate-request';

@Injectable()
export class CompleteLessonRequestPipe implements PipeTransform<
  unknown,
  CompleteLessonRequest
> {
  transform(value: unknown): CompleteLessonRequest {
    return validateRequest('CompleteLessonRequest', value);
  }
}
