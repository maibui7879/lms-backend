import {
  Controller,
  Get,
  Param,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser, MockAuthGuard } from '@lms/auth';
import type { ApiResponse, AuthUser, ProgressSyncData } from '@lms/contracts';
import type { Response } from 'express';
import { ApiExceptionFilter, apiError } from '../../common/api-error';
import { requestId } from '../../common/request-context';
import { validateRequest } from '../../common/validate-request';
import { ProgressSyncService } from './progress-sync.service';

@Controller('api/v1/learning/attempts')
@UseFilters(ApiExceptionFilter)
@UseGuards(MockAuthGuard)
export class ProgressSyncController {
  constructor(private readonly sync: ProgressSyncService) {}

  @Get(':id/sync')
  async getProgressSync(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ApiResponse<ProgressSyncData>> {
    if (user.role !== 'STUDENT' || user.status !== 'ACTIVE')
      throw apiError('FORBIDDEN', 'An active student account is required');
    const correlationId = requestId(response);
    const attemptId = validateRequest('Uuid', id).toLowerCase();
    return {
      data: await this.sync.getProgressSync(attemptId, user.id, correlationId),
      meta: { requestId: correlationId },
    };
  }
}
