import { Injectable } from '@nestjs/common';
import { MoreThanOrEqual } from 'typeorm';
import type { EntityManager } from 'typeorm';
import { LearningDatabase } from '../../../database/learning-database';
import { ItemCompletion } from '../entities/item-completion.entity';
import { checkCourseMutation } from '../../../database/course-migration-lock';
import type { CourseMutationVersion } from '../../../database/course-migration-lock';
import { legacyProgressScope, progressScope } from './progress-scope';
import type { ProgressEnrollment } from './progress-scope';

@Injectable()
export class ItemCompletionsRepository {
  constructor(private readonly database: LearningDatabase) {}

  async list(
    enrollment: ProgressEnrollment,
    manager?: EntityManager,
  ): Promise<ItemCompletion[]> {
    const scope = progressScope(enrollment);
    const legacy = {
      ...legacyProgressScope(scope),
      completedAt: MoreThanOrEqual(scope.enrolledAt),
    };
    const read = async (reader: EntityManager) => {
      const rows = await reader.getRepository(ItemCompletion).find({
        where: [legacy, scope],
        order: { enrolledAt: 'ASC' },
      });
      return [
        ...new Map(rows.map((row) => [row.learningItemId, row])).values(),
      ];
    };
    return manager
      ? read(manager)
      : this.database.run((db) => read(db.manager));
  }

  async complete(
    enrollment: ProgressEnrollment,
    learningItemId: string,
    version: CourseMutationVersion,
  ): Promise<ItemCompletion> {
    const scope = progressScope(enrollment);
    const key = { ...scope, learningItemId };
    return this.database.run((database) =>
      database.transaction(async (manager) => {
        await checkCourseMutation(manager, version);
        const repository = manager.getRepository(ItemCompletion);
        const legacy = {
          ...legacyProgressScope(scope),
          learningItemId,
          completedAt: MoreThanOrEqual(scope.enrolledAt),
        };
        if (!(await repository.existsBy(key)))
          await repository.update(legacy, { enrolledAt: scope.enrolledAt });
        await manager.query(
          `
        INSERT INTO learning_item_completions
          (enrollment_id, content_version, enrolled_at, learning_item_id, migration_count)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (enrollment_id, content_version, enrolled_at, learning_item_id) DO UPDATE
          SET status = 'COMPLETED', invalidated_at = NULL,
              invalidation_reason = NULL, completed_at = CURRENT_TIMESTAMP,
              migration_count = EXCLUDED.migration_count
          WHERE learning_item_completions.status <> 'COMPLETED'
      `,
          [
            scope.enrollmentId,
            scope.contentVersion,
            scope.enrolledAt,
            learningItemId,
            version.migrationCount,
          ],
        );
        return repository.findOneByOrFail(key);
      }),
    );
  }
}
