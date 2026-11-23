import { getMockUser } from '@lms/auth';
import { CourseRevisionsService } from './course-revisions.service';
import { CourseRevision } from './entities/course-revision.entity';
import { LearningItem } from '../learning-items/entities/learning-item.entity';

it('clones rich content and attachments without sharing mutable snapshot data', async () => {
  const owner = getMockUser('instructorA');
  const files = [
    {
      fileName: 'notes.pdf',
      fileUrl: 'https://example.com/notes.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 10,
    },
  ];
  const sources = [
    {
      id: 'video',
      lessonId: 'lesson',
      type: 'VIDEO',
      title: 'Video',
      attachments: files,
    },
    {
      id: 'reading',
      lessonId: 'lesson',
      type: 'READING',
      title: 'Reading',
      bodyFormat: 'HTML',
      body: '<p>Image</p><img src="https://example.com/a.png">',
    },
  ];
  const clones: Record<string, unknown>[] = [];
  const manager = {
    create: jest.fn((entity, input) => {
      if (entity === LearningItem) clones.push(input);
      return {
        ...input,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        id: entity === CourseRevision ? 'revision' : `clone-${clones.length}`,
      };
    }),
    save: jest.fn(async (...args) => args.at(-1)),
    find: jest.fn(async (entity) => (entity === LearningItem ? sources : [])),
    findOneBy: jest.fn(async () => null),
    update: jest.fn(async () => ({ affected: 1 })),
  };
  const service = new CourseRevisionsService(
    {
      findOneBy: jest.fn(async () => ({
        id: 'course',
        instructorId: owner.id,
        status: 'PUBLISHED',
        contentVersion: 1,
      })),
    } as never,
    {} as never,
    { findOne: jest.fn(async () => null) } as never,
    {} as never,
    {} as never,
    {} as never,
    {
      transaction: async (work: (value: typeof manager) => unknown) =>
        work(manager),
    } as never,
  );
  await service.createRevision(
    'course',
    {
      baseContentVersion: 1,
      updateType: 'NORMAL',
      migrationPolicy: 'KEEP_ENROLLED_VERSION',
    },
    owner,
  );
  expect(clones[0].attachments).toEqual(files);
  expect(clones[0].attachments).not.toBe(files);
  expect(clones[1]).toMatchObject({
    bodyFormat: 'HTML',
    body: sources[1].body,
  });
  (clones[0].attachments as typeof files)[0].fileName = 'changed.pdf';
  expect(files[0].fileName).toBe('notes.pdf');
});
