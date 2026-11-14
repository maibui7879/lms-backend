import { Injectable } from '@nestjs/common';
import { LearningDatabase } from '../../../database/learning-database';
import { LessonCompletion } from '../entities/lesson-completion.entity';
import { checkCourseMutation } from '../../../database/course-migration-lock';
import type { CourseMutationVersion } from '../../../database/course-migration-lock';

type LessonCompletionKey = Pick<
  LessonCompletion,
  'enrollmentId' | 'contentVersion' | 'lessonId'
>;

@Injectable()
export class LessonCompletionsRepository {
  constructor(private readonly database: LearningDatabase) {}

  list(enrollmentId: string, contentVersion: number) {
    return this.database.run((database) =>
      database
        .getRepository(LessonCompletion)
        .findBy({ enrollmentId, contentVersion }),
    );
  }

  find(key: LessonCompletionKey) {
    return this.database.run((database) =>
      database.getRepository(LessonCompletion).findOneBy(key),
    );
  }

  async complete(
    key: LessonCompletionKey,
    version?: CourseMutationVersion,
    requiredGeneration = 0,
  ) {
    return this.database.run((database) =>
      database.transaction(async (manager) => {
        await checkCourseMutation(manager, version);
        const repository = manager.getRepository(LessonCompletion);
        if (requiredGeneration) {
          await manager.query(
            `
          UPDATE learning_lesson_completions SET completed_at = CURRENT_TIMESTAMP, migration_count = $5
          WHERE enrollment_id = $1 AND content_version = $2 AND lesson_id = $3
            AND migration_count < $4
        `,
            [
              key.enrollmentId,
              key.contentVersion,
              key.lessonId,
              requiredGeneration,
              version?.migrationCount ?? 0,
            ],
          );
        }
        await repository
          .createQueryBuilder()
          .insert()
          .values({ ...key, migrationCount: version?.migrationCount ?? 0 })
          .orIgnore()
          .updateEntity(false)
          .execute();
        return repository.findOneByOrFail(key);
      }),
    );
  }
}
