import type { EntityManager } from 'typeorm';
import { apiError } from '../common/api-error';

export interface CourseMutationVersion {
  courseId: string;
  migrationCount: number;
}

export async function lockCourseMigration(
  manager: EntityManager,
  courseId: string,
) {
  await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
    courseId,
  ]);
}

export async function checkCourseMutation(
  manager: EntityManager,
  version?: CourseMutationVersion,
) {
  if (!version) return;
  await lockCourseMigration(manager, version.courseId);
  const [{ count }] = await manager.query<{ count: number }[]>(
    'SELECT count(*)::int AS count FROM learning_course_item_migrations WHERE course_id = $1',
    [version.courseId],
  );
  if (count !== version.migrationCount)
    throw apiError(
      'REVISION_CONFLICT',
      'Course requirements changed. Reload the learning data.',
    );
}
