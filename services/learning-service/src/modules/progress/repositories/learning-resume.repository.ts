import { Injectable } from '@nestjs/common';
import type { SaveResumeRequest } from '@lms/contracts';
import { LearningDatabase } from '../../../database/learning-database';
import { LearningResume } from '../entities/learning-resume.entity';
import { checkCourseMutation } from '../../../database/course-migration-lock';
import type { CourseMutationVersion } from '../../../database/course-migration-lock';

type ResumeCheckpoint = Omit<LearningResume, 'enrollmentId' | 'contentVersion'>;

@Injectable()
export class LearningResumeRepository {
  constructor(private readonly database: LearningDatabase) {}

  find(enrollmentId: string, contentVersion: number) {
    return this.database.run((database) =>
      database.getRepository(LearningResume).findOneBy({
        enrollmentId,
        contentVersion,
      }),
    );
  }

  async save(
    enrollmentId: string,
    {
      contentVersion,
      lessonId,
      learningItemId,
      positionSeconds,
      expectedRevision,
    }: SaveResumeRequest,
    version?: CourseMutationVersion,
  ): Promise<ResumeCheckpoint | null> {
    const values = [
      enrollmentId,
      contentVersion,
      lessonId,
      learningItemId,
      positionSeconds,
      version?.migrationCount ?? 0,
    ];
    const operation =
      expectedRevision === 0
        ? `INSERT INTO learning_resume_checkpoints
             (enrollment_id, content_version, lesson_id, learning_item_id, position_seconds, revision, migration_count)
           VALUES ($1, $2, $3, $4, $5, 1, $6)
           ON CONFLICT (enrollment_id, content_version) DO NOTHING`
        : `UPDATE learning_resume_checkpoints
           SET lesson_id = $3, learning_item_id = $4, position_seconds = $5,
               updated_at = CURRENT_TIMESTAMP, revision = revision + 1, migration_count = $6
           WHERE enrollment_id = $1 AND content_version = $2 AND revision = $7::numeric`;
    if (expectedRevision !== 0) values.push(expectedRevision);

    // One statement compares the revision and returns the row written by this request.
    const [checkpoint] = await this.database.run((database) =>
      database.transaction(async (manager) => {
        await checkCourseMutation(manager, version);
        return manager.query<ResumeCheckpoint[]>(
          `WITH saved AS (
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
