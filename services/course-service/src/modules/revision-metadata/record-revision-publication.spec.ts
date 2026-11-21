import type { EntityManager } from 'typeorm';
import { recordRevisionPublication } from './record-revision-publication';
import { CourseRevision } from '../course-revisions/entities/course-revision.entity';
import { LearningItem } from '../learning-items/entities/learning-item.entity';
import { CoursePatchNotice, CourseRevisionChange } from './entities';
import { CourseMigrationDispatch } from '../outbox/course-migration-dispatch';

it('records only changed content, additions and deletions, and one critical notice', async () => {
  const revision = Object.assign(new CourseRevision(), {
    id: 'revision',
    courseId: 'course',
    status: 'PUBLISHED',
    contentVersion: 2,
    baseContentVersion: 1,
    publishedAt: new Date(),
    updateType: 'CRITICAL',
    migrationPolicy: 'MIGRATE_AFFECTED_ITEMS',
    sourceChapterIds: {},
    sourceLessonIds: { clonedLesson: 'lesson' },
    sourceItemIds: { unchanged: 'original', changed: 'oldChanged' },
  });
  const saves: { entity: unknown; value: unknown }[] = [];
  const before = [
    { id: 'original', title: 'Same', lessonId: 'lesson', version: 1 },
    { id: 'oldChanged', title: 'Before', version: 1 },
    { id: 'deleted', title: 'Removed', version: 1 },
  ];
  const after = [
    { id: 'unchanged', title: 'Same', lessonId: 'clonedLesson', version: 1 },
    { id: 'changed', title: 'After', version: 2 },
    { id: 'added', title: 'New', version: 1 },
  ];
  const manager = {
    insert: jest.fn().mockResolvedValue({}),
    findOneBy: jest.fn().mockResolvedValue(null),
    find: jest.fn(
      async (entity: unknown, options: { where: { revisionId: unknown } }) =>
        entity === LearningItem
          ? options.where.revisionId === revision.id
            ? after
            : before
          : [],
    ),
    create: (_entity: unknown, value: unknown) => value,
    save: async (entity: unknown, value: unknown) => {
      saves.push({ entity, value });
      return value;
    },
  };
  await recordRevisionPublication(
    manager as unknown as EntityManager,
    revision,
  );
  const changes = saves.find((save) => save.entity === CourseRevisionChange)
    ?.value as CourseRevisionChange[];
  expect(manager.insert).toHaveBeenCalledWith(CourseMigrationDispatch, {
    revisionId: 'revision',
    courseId: 'course',
    sentAt: null,
    request: {
      revisionId: 'revision',
      itemIds: ['changed', 'added'],
      policy: 'REQUIRE_RECOMPLETION',
      reason: 'Critical published course correction',
    },
  });
  expect(changes.map((change) => [change.entityId, change.changeType])).toEqual(
    [
      ['changed', 'UPDATED'],
      ['added', 'ADDED'],
      ['deleted', 'DELETED'],
    ],
  );
  expect(
    saves.find((save) => save.entity === CoursePatchNotice)?.value,
  ).toMatchObject({
    severity: 'CRITICAL',
    requiresAction: true,
    revisionId: 'revision',
  });
});
