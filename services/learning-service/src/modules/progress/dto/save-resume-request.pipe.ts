import { Injectable } from '@nestjs/common';
import type { PipeTransform } from '@nestjs/common';
import type { SaveResumeRequest } from '@lms/contracts';
import { validateRequest } from '../../../common/validate-request';

@Injectable()
export class SaveResumeRequestPipe implements PipeTransform<
  unknown,
  SaveResumeRequest
> {
  transform(value: unknown): SaveResumeRequest {
    return validateRequest('SaveResumeRequest', value);
  }
}
