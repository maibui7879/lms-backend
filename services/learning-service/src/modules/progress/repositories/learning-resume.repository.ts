import { Injectable } from '@nestjs/common';
import { MoreThanOrEqual } from 'typeorm';
import type { EntityManager } from 'typeorm';
import type { SaveResumeRequest } from '@lms/contracts';
import { LearningDatabase } from '../../../database/learning-database';
import { LearningResume } from '../entities/learning-resume.entity';
import { checkCourseMutation } from '../../../database/course-migration-lock';
import type { CourseMutationVersion } from '../../../database/course-migration-lock';
import { legacyProgressScope, progressScope } from './progress-scope';
import type { ProgressEnrollment } from './progress-scope';

type ResumeCheckpoint = Omit<LearningResume, keyof ProgressEnrollment>;

function legacyResumeScope(scope: ReturnType<typeof progressScope>) {
  return {
    ...legacyProgressScope(scope),
    updatedAt: MoreThanOrEqual(scope.enrolledAt),
  };
}

@Injectable()
export class LearningResumeRepository {
  constructor(private readonly database: LearningDatabase) {}

  find(enrollment: ProgressEnrollment, manager?: EntityManager) {
    const scope = progressScope(enrollment);
    const read = (reader: EntityManager) =>
      reader.getRepository(LearningResume).findOne({
        where: [scope, legacyResumeScope(scope)],
        order: { enrolledAt: 'DESC' },
      });
    return manager
      ? read(manager)
      : this.database.run((db) => read(db.manager));
  }

  async save(
    enrollment: ProgressEnrollment,
    {
      lessonId,
      learningItemId,
      positionSeconds,
      expectedRevision,
    }: SaveResumeRequest,
    version: CourseMutationVersion,
  ): Promise<ResumeCheckpoint | null> {
    const scope = progressScope(enrollment);
    const values = [
      scope.enrollmentId,
      scope.contentVersion,
      scope.enrolledAt,
      lessonId,
      learningItemId,
      positionSeconds,
      version.migrationCount,
    ];
    const operation =
      expectedRevision === 0
        ? `INSERT INTO learning_resume_checkpoints
             (enrollment_id, content_version, enrolled_at, lesson_id, learning_item_id, position_seconds, revision, migration_count)
           SELECT $1, $2, $3, $4, $5, $6, revision, $7 FROM next_revision
           ON CONFLICT (enrollment_id, content_version, enrolled_at) DO NOTHING`
        : `UPDATE learning_resume_checkpoints
           SET lesson_id = $4, learning_item_id = $5, position_seconds = $6,
               updated_at = CURRENT_TIMESTAMP,
               revision = (SELECT revision FROM next_revision), migration_count = $7
           WHERE enrollment_id = $1 AND content_version = $2 AND enrolled_at = $3 AND revision = $8::numeric`;
    if (expectedRevision !== 0) values.push(expectedRevision);

    const [checkpoint] = await this.database.run((database) =>
      database.transaction(async (manager) => {
        await checkCourseMutation(manager, version);
        const repository = manager.getRepository(LearningResume);
        if (!(await repository.existsBy(scope)))
          await repository.update(legacyResumeScope(scope), {
            enrolledAt: scope.enrolledAt,
          });
        // The course lock serializes revision allocation across sessions sharing the same ID.
        return manager.query<ResumeCheckpoint[]>(
          `WITH next_revision AS (
           SELECT COALESCE(MAX(revision), 0) + 1 AS revision
           FROM learning_resume_checkpoints
           WHERE enrollment_id = $1 AND content_version = $2
         ), saved AS (
           ${operation}
           RETURNING lesson_id AS "lessonId", learning_item_id AS "learningItemId",
                     position_seconds AS "positionSeconds", updated_at AS "updatedAt", revision,
                     migration_count AS "migrationCount"
         )
         SELECT * FROM saved`,
          values,
        );
      }),
    );
    return checkpoint ?? null;
  }
}
