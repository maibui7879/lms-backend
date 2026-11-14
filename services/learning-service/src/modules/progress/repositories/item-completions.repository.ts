import { Injectable } from '@nestjs/common';
import { LearningDatabase } from '../../../database/learning-database';
import { ItemCompletion } from '../entities/item-completion.entity';
import { checkCourseMutation } from '../../../database/course-migration-lock';
import type { CourseMutationVersion } from '../../../database/course-migration-lock';

@Injectable()
export class ItemCompletionsRepository {
  constructor(private readonly database: LearningDatabase) {}

  async list(
    enrollmentId: string,
    contentVersion: number,
  ): Promise<ItemCompletion[]> {
    return this.database.run((database) =>
      database
        .getRepository(ItemCompletion)
        .findBy({ enrollmentId, contentVersion }),
    );
  }

  async complete(
    enrollmentId: string,
    contentVersion: number,
    learningItemId: string,
    version?: CourseMutationVersion,
  ): Promise<ItemCompletion> {
    const key = { enrollmentId, contentVersion, learningItemId };
    return this.database.run((database) =>
      database.transaction(async (manager) => {
        await checkCourseMutation(manager, version);
        const repository = manager.getRepository(ItemCompletion);
        await manager.query(
          `
        INSERT INTO learning_item_completions
          (enrollment_id, content_version, learning_item_id, migration_count)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (enrollment_id, content_version, learning_item_id) DO UPDATE
          SET status = 'COMPLETED', invalidated_at = NULL,
              invalidation_reason = NULL, completed_at = CURRENT_TIMESTAMP,
              migration_count = EXCLUDED.migration_count
          WHERE learning_item_completions.status <> 'COMPLETED'
      `,
          [
            enrollmentId,
            contentVersion,
            learningItemId,
            version?.migrationCount ?? 0,
          ],
        );
        return repository.findOneByOrFail(key);
      }),
    );
  }
}
