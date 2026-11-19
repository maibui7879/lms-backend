import type { DataSource } from 'typeorm';
import { getMockUser } from '@lms/auth';
import { RevisionMetadataService } from './revision-metadata.service';
import { Course } from '../courses/entities/course.entity';
import { CourseRevision } from '../course-revisions/entities/course-revision.entity';
import { LearningItem } from '../learning-items/entities/learning-item.entity';
import { CompletionPolicy } from '../completion-policy/entities/completion-policy.entity';

function fixture() {
  const now = new Date('2026-01-01T00:00:00Z');
  const revision = {
    id: 'revision',
    courseId: 'course',
    status: 'PUBLISHED',
    contentVersion: 2,
    baseContentVersion: 1,
    publishedAt: now,
    createdAt: now,
    sourceItemIds: { target: 'source' },
  };
  const source = {
    id: 'source',
    courseId: 'course',
    revisionId: null,
    contentVersion: 1,
    title: 'Original',
    type: 'READING',
    body: 'Read',
    createdAt: now,
    updatedAt: now,
  };
  const target = {
    ...source,
    id: 'target',
    revisionId: 'revision',
    contentVersion: 2,
    title: 'Renamed and moved',
  };
  const findOneBy = jest.fn(async (entity: unknown, where: { id?: string }) => {
    if (entity === CourseRevision) return revision;
    if (entity === LearningItem) return where.id === source.id ? source : null;
    if (entity === CompletionPolicy)
      return { requiredAssessments: [], chapterPolicies: [] };
    if (entity === Course) return { initialPublishedContentVersion: 1 };
    return null;
  });
  const manager = { findOneBy, find: jest.fn().mockResolvedValue([target]) };
  const transaction = jest.fn(
    async (_isolation: string, work: (manager: unknown) => unknown) =>
      work(manager),
  );
  const service = new RevisionMetadataService({
    transaction,
  } as unknown as DataSource);
  return { service, revision, source, target };
}
it('uses persisted identity across title and placement edits', async () => {
  const { service } = fixture();
  const result = await service.context('revision');
  expect(result.items[0].item.id).toBe('target');
  expect(result.items[0].previousItems.map((item) => item.id)).toEqual([
    'source',
  ]);
});
it('rejects a source that does not belong to the revision base snapshot', async () => {
  const { service, source } = fixture();
  source.contentVersion = 2;
  await expect(service.context('revision')).rejects.toThrow(
    'Invalid item lineage source',
  );
});
it('rejects cycles and unpublished targets', async () => {
  const { service, revision } = fixture();
  revision.sourceItemIds.target = 'target';
  await expect(service.context('revision')).rejects.toThrow(
    'Invalid item lineage',
  );
  revision.publishedAt = null as unknown as Date;
  await expect(service.context('revision')).rejects.toThrow(
    'Published revision not found',
  );
});
it('denies non-enrolled students before listing notice records', async () => {
  const findAndCount = jest.fn();
  const db = {
    getRepository: (entity: unknown) => ({
      findOneBy: jest
        .fn()
        .mockResolvedValue(
          entity === Course ? { instructorId: 'other' } : null,
        ),
      findAndCount,
    }),
  };
  const service = new RevisionMetadataService(db as unknown as DataSource);
  await expect(
    service.notices('course', {}, getMockUser('studentA')),
  ).rejects.toThrow('Course access required');
  expect(findAndCount).not.toHaveBeenCalled();
});
