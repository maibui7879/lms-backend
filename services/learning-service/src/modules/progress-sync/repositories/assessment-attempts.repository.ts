import { isDeepStrictEqual } from 'node:util';
import { Injectable } from '@nestjs/common';
import type {
  AttemptAccessData,
  AttemptGradedV2Event,
  EnrollmentSnapshotData,
  GradedAssessmentSummary,
} from '@lms/contracts';
import { IsNull, MoreThanOrEqual } from 'typeorm';
import type { EntityManager } from 'typeorm';
import { LearningDatabase } from '../../../database/learning-database';
import { AssessmentAttempt } from '../entities/assessment-attempt.entity';
import { AssessmentSyncReceipt } from '../entities/assessment-sync-receipt.entity';

function receiptKey({ eventId, payload }: AttemptGradedV2Event) {
  const { attemptId, assessmentVersion, userId, courseId } = payload;
  return {
    eventId: eventId.toLowerCase(),
    attemptId: attemptId.toLowerCase(),
    assessmentVersion,
    userId: userId.toLowerCase(),
    courseId: courseId.toLowerCase(),
  };
}

class AssessmentEventConflict extends Error {}

function normalizeResult(
  result: GradedAssessmentSummary,
): GradedAssessmentSummary {
  return {
    ...result,
    attemptId: result.attemptId.toLowerCase(),
    userId: result.userId.toLowerCase(),
    courseId: result.courseId.toLowerCase(),
    quizId: result.quizId.toLowerCase(),
    gradedAt: new Date(result.gradedAt).toISOString(),
    skillScores: result.skillScores.map((skill) => ({
      ...skill,
      skillId: skill.skillId.toLowerCase(),
    })),
  };
}

@Injectable()
export class AssessmentAttemptsRepository {
  constructor(private readonly database: LearningDatabase) {}

  async record(event: AttemptGradedV2Event): Promise<'SYNCED' | 'CONFLICT'> {
    const key = receiptKey(event);
    const payload = normalizeResult(event.payload);
    return this.database.run(async (database) => {
      try {
        await database.transaction(async (manager) => {
          const receipts = manager.getRepository(AssessmentSyncReceipt);
          await receipts
            .createQueryBuilder()
            .insert()
            .into(AssessmentSyncReceipt)
            .values({ ...key, status: 'PENDING' })
            .orIgnore()
            .execute();
          const receipt = await receipts.findOneOrFail({
            where: { eventId: key.eventId },
            lock: { mode: 'pessimistic_write' },
          });
          if (
            receipt.attemptId !== key.attemptId ||
            receipt.userId !== key.userId ||
            receipt.courseId !== key.courseId ||
            (receipt.assessmentVersion !== null &&
              receipt.assessmentVersion !== key.assessmentVersion)
          ) {
            throw new AssessmentEventConflict();
          }

          const attempts = manager.getRepository(AssessmentAttempt);
          await attempts
            .createQueryBuilder()
            .insert()
            .into(AssessmentAttempt)
            .values({
              ...key,
              gradedAt: new Date(payload.gradedAt),
              result: payload,
            })
            .orIgnore()
            .execute();
          const saved = await attempts.findOneBy({
            attemptId: key.attemptId,
            assessmentVersion: key.assessmentVersion,
          });
          if (
            !saved ||
            !isDeepStrictEqual(normalizeResult(saved.result), payload)
          ) {
            throw new AssessmentEventConflict();
          }
          await this.writeReceipt(manager, event, 'SYNCED');
        });
        return 'SYNCED';
      } catch (error) {
        if (error instanceof AssessmentEventConflict) return 'CONFLICT';
        throw error;
      }
    });
  }

  async markRetrying(event: AttemptGradedV2Event): Promise<void> {
    const key = receiptKey(event);
    await this.database.run((database) =>
      database.getRepository(AssessmentSyncReceipt).update(
        [
          { ...key, status: 'FAILED' },
          { ...key, assessmentVersion: IsNull(), status: 'FAILED' },
        ],
        {
          status: 'PENDING',
          assessmentVersion: key.assessmentVersion,
          updatedAt: () => 'CURRENT_TIMESTAMP',
        },
      ),
    );
  }

  async markFailed(event: AttemptGradedV2Event): Promise<void> {
    await this.database.run((database) =>
      this.writeReceipt(database.manager, event, 'FAILED'),
    );
  }

  findReceipt({ eventId, attemptId, userId, courseId }: AttemptAccessData) {
    if (eventId === null) return Promise.resolve(null);
    return this.database.run((database) =>
      database.getRepository(AssessmentSyncReceipt).findOneBy({
        eventId,
        attemptId,
        userId,
        courseId,
      }),
    );
  }

  list({ userId, courseId, enrolledAt }: EnrollmentSnapshotData) {
    return this.database.run((database) =>
      database.getRepository(AssessmentAttempt).findBy({
        userId,
        courseId,
        gradedAt: MoreThanOrEqual(new Date(enrolledAt)),
      }),
    );
  }

  private async writeReceipt(
    manager: EntityManager,
    event: AttemptGradedV2Event,
    status: 'SYNCED' | 'FAILED',
  ): Promise<void> {
    const { eventId, attemptId, assessmentVersion, userId, courseId } =
      receiptKey(event);
    await manager.query(
      `
        INSERT INTO learning_assessment_sync_receipts AS receipt
          (event_id, attempt_id, assessment_version, user_id, course_id, status)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (event_id) DO UPDATE
        SET status = EXCLUDED.status,
            assessment_version = EXCLUDED.assessment_version,
            updated_at = CURRENT_TIMESTAMP
        WHERE receipt.attempt_id = EXCLUDED.attempt_id
          AND receipt.user_id = EXCLUDED.user_id
          AND receipt.course_id = EXCLUDED.course_id
          AND (receipt.assessment_version IS NULL
            OR receipt.assessment_version = EXCLUDED.assessment_version)
          AND receipt.status <> 'SYNCED'
          AND receipt.status <> EXCLUDED.status
      `,
      [eventId, attemptId, assessmentVersion, userId, courseId, status],
    );
  }
}
