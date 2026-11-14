import { isDeepStrictEqual } from 'node:util';
import { Injectable } from '@nestjs/common';
import type {
  CourseItemMigrationContext,
  MigrateCourseItemsRequest,
} from '@lms/contracts';
import { apiError } from '../../../common/api-error';
import { lockCourseMigration } from '../../../database/course-migration-lock';
import { LearningDatabase } from '../../../database/learning-database';
import { CourseItemMigration } from '../entities/course-item-migration.entity';

@Injectable()
export class CourseItemMigrationsRepository {
  constructor(private readonly database: LearningDatabase) {}

  list(courseId: string) {
    return this.database.run((database) =>
      database.getRepository(CourseItemMigration).find({
        where: { courseId },
        order: {
          contentVersion: 'DESC',
          appliedAt: 'DESC',
          targetItemId: 'ASC',
        },
      }),
    );
  }

  apply(
    courseId: string,
    request: MigrateCourseItemsRequest,
    context: CourseItemMigrationContext,
  ): Promise<void> {
    return this.database.run((database) =>
      database.transaction(async (manager) => {
        await lockCourseMigration(manager, courseId);
        const repository = manager.getRepository(CourseItemMigration);
        let generation = await repository.countBy({ courseId });
        for (const itemId of request.itemIds) {
          const itemContext = context.items.find(
            ({ item }) => item.id === itemId,
          )!;
          const key = {
            revisionId: request.revisionId,
            targetItemId: itemId,
            policy: request.policy,
          };
          const existing = await repository.findOneBy(key);
          if (existing) {
            if (
              existing.courseId !== courseId ||
              existing.reason !== request.reason ||
              !isDeepStrictEqual(
                JSON.parse(JSON.stringify(existing.context)),
                JSON.parse(JSON.stringify(itemContext)),
              )
            )
              throw apiError(
                'REVISION_CONFLICT',
                'Migration identity was already used with different data',
              );
            continue;
          }
          const saved = await repository.save(
            repository.create({
              ...key,
              courseId,
              contentVersion: context.revision.contentVersion!,
              generation: ++generation,
              reason: request.reason,
              context: itemContext,
            }),
          );
          if (request.policy === 'NOTIFY_ONLY') continue;

          for (const source of itemContext.previousItems) {
            await manager.query(
              `
              UPDATE learning_item_completions
              SET status = 'OUTDATED', invalidated_at = $3, invalidation_reason = $4
              WHERE learning_item_id = $1 AND content_version = $2
                AND NOT EXISTS (
                  SELECT 1 FROM learning_course_item_migrations newer,
                    jsonb_array_elements(newer.context->'previousItems') previous
                  WHERE newer.course_id = $5 AND newer.policy = 'REQUIRE_RECOMPLETION'
                    AND newer.content_version > $6
                    AND previous->>'id' = $1::text
                )
            `,
              [
                source.id,
                source.contentVersion,
                saved.appliedAt,
                request.reason,
                courseId,
                saved.contentVersion,
              ],
            );
          }
        }
      }),
    );
  }
}
