import { ConflictException } from '@nestjs/common';
import { IsNull } from 'typeorm';
import type { EntityManager } from 'typeorm';
import type { RevisionEntityType } from '@lms/contracts';
import { CourseRevision } from '../course-revisions/entities/course-revision.entity';
import { Chapter } from '../chapters/entities/chapter.entity';
import { Lesson } from '../lessons/entities/lesson.entity';
import { LearningItem } from '../learning-items/entities/learning-item.entity';
import { CoursePatchNotice, CourseRevisionChange } from './entities';
import { CourseMigrationDispatch } from '../outbox/course-migration-dispatch';

/** Call inside the approval transaction, after saving published item versions. */
export async function recordRevisionPublication(
  manager: EntityManager,
  revision: CourseRevision,
): Promise<void> {
  if (
    revision.status !== 'PUBLISHED' ||
    !revision.publishedAt ||
    revision.contentVersion === null
  )
    throw new ConflictException(
      'Publication metadata requires a published revision',
    );
  const base = await manager.findOneBy(CourseRevision, {
    courseId: revision.courseId,
    contentVersion: revision.baseContentVersion,
    status: 'PUBLISHED',
  });
  const baseWhere = {
    courseId: revision.courseId,
    revisionId: base?.id ?? IsNull(),
  };
  const targetWhere = { courseId: revision.courseId, revisionId: revision.id };
  // Compare fields explicitly: clone IDs, timestamps and entity versions are not content changes.
  const groups = [
    {
      entity: Chapter,
      type: 'CHAPTER' as RevisionEntityType,
      sources: revision.sourceChapterIds,
      fields: ['title', 'order', 'endSectionQuiz'],
    },
    {
      entity: Lesson,
      type: 'LESSON' as RevisionEntityType,
      sources: revision.sourceLessonIds,
      fields: ['title', 'order', 'chapterId'],
    },
    {
      entity: LearningItem,
      type: 'LEARNING_ITEM' as RevisionEntityType,
      sources: revision.sourceItemIds,
      fields: [
        'title',
        'type',
        'videoUrl',
        'durationSeconds',
        'body',
        'bodyFormat',
        'attachments',
        'quizId',
        'assessmentVersion',
        'required',
        'order',
        'lessonId',
      ],
    },
  ];
  const affectedItemIds: string[] = [];
  for (const group of groups) {
    if (!group.sources)
      throw new ConflictException('Revision source mapping unavailable');
    const before = await manager.find(group.entity, { where: baseWhere });
    const after = await manager.find(group.entity, { where: targetWhere });
    const consumed = new Set<string>();
    const changes: CourseRevisionChange[] = [];
    for (const item of after) {
      const sourceId = group.sources[item.id];
      const source = sourceId
        ? before.find((row) => row.id === sourceId)
        : undefined;
      if (sourceId && !source)
        throw new ConflictException('Revision source snapshot unavailable');
      if (source) consumed.add(source.id);
      const normalize = (row: object, target: boolean) =>
        Object.fromEntries(
          group.fields.map((field) => {
            let value = (row as Record<string, unknown>)[field];
            if (target && typeof value === 'string') {
              const targetId = value;
              if (field === 'chapterId')
                value = revision.sourceChapterIds[targetId] ?? targetId;
              if (field === 'lessonId')
                value = revision.sourceLessonIds[targetId] ?? targetId;
            }
            return [field, value];
          }),
        );
      if (
        source &&
        JSON.stringify(normalize(source, false)) ===
          JSON.stringify(normalize(item, true))
      )
        continue;
      changes.push(
        manager.create(CourseRevisionChange, {
          revisionId: revision.id,
          entityType: group.type,
          entityId: item.id,
          changeType: source ? 'UPDATED' : 'ADDED',
          oldVersion: source?.version ?? null,
          newVersion: item.version,
          isCritical: revision.updateType === 'CRITICAL',
          summary: `${source ? 'Updated' : 'Added'} ${group.type.toLowerCase()}`,
        }),
      );
    }
    for (const source of before.filter((row) => !consumed.has(row.id))) {
      changes.push(
        manager.create(CourseRevisionChange, {
          revisionId: revision.id,
          entityType: group.type,
          entityId: source.id,
          changeType: 'DELETED',
          oldVersion: source.version,
          newVersion: null,
          isCritical: revision.updateType === 'CRITICAL',
          summary: `Deleted ${group.type.toLowerCase()}`,
        }),
      );
    }
    if (changes.length) await manager.save(CourseRevisionChange, changes);
    if (group.type === 'LEARNING_ITEM') {
      affectedItemIds.push(
        ...changes
          .filter((change) => change.changeType !== 'DELETED')
          .map((change) => change.entityId),
      );
    }
  }
  if (
    revision.updateType === 'CRITICAL' &&
    revision.migrationPolicy === 'MIGRATE_AFFECTED_ITEMS' &&
    affectedItemIds.length
  ) {
    await manager.insert(CourseMigrationDispatch, {
      revisionId: revision.id,
      courseId: revision.courseId,
      request: {
        revisionId: revision.id,
        itemIds: affectedItemIds,
        policy: 'REQUIRE_RECOMPLETION',
        reason: 'Critical published course correction',
      },
      sentAt: null,
    });
  }
  await manager.save(
    CoursePatchNotice,
    manager.create(CoursePatchNotice, {
      courseId: revision.courseId,
      revisionId: revision.id,
      severity: revision.updateType === 'CRITICAL' ? 'CRITICAL' : 'INFO',
      title: 'Course content updated',
      message: `Course content version ${revision.contentVersion} has been published.`,
      requiresAction: revision.migrationPolicy === 'MIGRATE_AFFECTED_ITEMS',
      publishedAt: revision.publishedAt,
    }),
  );
}
