import { Injectable } from '@nestjs/common';
import { MoreThanOrEqual } from 'typeorm';
import type { EntityManager } from 'typeorm';
import { LearningDatabase } from '../../../database/learning-database';
import { LessonCompletion } from '../entities/lesson-completion.entity';
import { checkCourseMutation } from '../../../database/course-migration-lock';
import type { CourseMutationVersion } from '../../../database/course-migration-lock';
import { legacyProgressScope, progressScope } from './progress-scope';
import type { ProgressEnrollment } from './progress-scope';

function legacyLessonScope(scope: ReturnType<typeof progressScope>) {
  return {
    ...legacyProgressScope(scope),
    completedAt: MoreThanOrEqual(scope.enrolledAt),
  };
}

@Injectable()
export class LessonCompletionsRepository {
  constructor(private readonly database: LearningDatabase) {}

  list(enrollment: ProgressEnrollment, manager?: EntityManager) {
    const scope = progressScope(enrollment);
    const read = async (reader: EntityManager) => {
      const rows = await reader.getRepository(LessonCompletion).find({
        where: [legacyLessonScope(scope), scope],
        order: { enrolledAt: 'ASC' },
      });
      return [...new Map(rows.map((row) => [row.lessonId, row])).values()];
    };
    return manager
      ? read(manager)
      : this.database.run((db) => read(db.manager));
  }

  find(enrollment: ProgressEnrollment, lessonId: string) {
    const scope = progressScope(enrollment);
    return this.database.run((database) =>
      database.getRepository(LessonCompletion).findOne({
        where: [
          { ...scope, lessonId },
          { ...legacyLessonScope(scope), lessonId },
        ],
        order: { enrolledAt: 'DESC' },
      }),
    );
  }

  async complete(
    enrollment: ProgressEnrollment,
    lessonId: string,
    version: CourseMutationVersion,
    requiredGeneration = 0,
  ) {
    const scope = progressScope(enrollment);
    const key = { ...scope, lessonId };
    return this.database.run((database) =>
      database.transaction(async (manager) => {
        await checkCourseMutation(manager, version);
        const repository = manager.getRepository(LessonCompletion);
        if (!(await repository.existsBy(key)))
          await repository.update(
            { ...legacyLessonScope(scope), lessonId },
            { enrolledAt: scope.enrolledAt },
          );
        if (requiredGeneration) {
          await manager.query(
            `
          UPDATE learning_lesson_completions SET completed_at = CURRENT_TIMESTAMP, migration_count = $6
          WHERE enrollment_id = $1 AND content_version = $2 AND enrolled_at = $3 AND lesson_id = $4
            AND migration_count < $5
        `,
            [
              key.enrollmentId,
              key.contentVersion,
              key.enrolledAt,
              key.lessonId,
              requiredGeneration,
              version.migrationCount,
            ],
          );
        }
        await repository
          .createQueryBuilder()
          .insert()
          .values({ ...key, migrationCount: version.migrationCount })
          .orIgnore()
          .updateEntity(false)
          .execute();
        return repository.findOneByOrFail(key);
      }),
    );
  }
}
