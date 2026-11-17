import { Injectable } from '@nestjs/common';
import type { ProgressSyncData } from '@lms/contracts';
import { apiError } from '../../common/api-error';
import { QuizClient } from '../../integrations/quiz.client';
import { AssessmentAttemptsRepository } from './repositories/assessment-attempts.repository';

@Injectable()
export class ProgressSyncService {
  constructor(
    private readonly quiz: QuizClient,
    private readonly attempts: AssessmentAttemptsRepository,
  ) {}

  async getProgressSync(
    attemptId: string,
    userId: string,
    requestId: string,
  ): Promise<ProgressSyncData> {
    const access = await this.quiz.attemptAccess(attemptId, requestId);
    if (!access) throw apiError('NOT_FOUND', 'Quiz attempt not found');
    if (access.userId.toLowerCase() !== userId.toLowerCase())
      throw apiError(
        'NOT_ATTEMPT_OWNER',
        'Quiz attempt belongs to another learner',
      );

    const receipt = await this.attempts.findReceipt(access);
    return {
      attemptId,
      eventId: access.eventId,
      status: receipt?.status ?? 'PENDING',
      updatedAt: receipt?.updatedAt.toISOString() ?? null,
      error:
        receipt?.status === 'FAILED'
          ? {
              code: 'PROJECTION_FAILED',
              message: 'Learning could not apply the quiz result',
            }
          : null,
    };
  }
}
