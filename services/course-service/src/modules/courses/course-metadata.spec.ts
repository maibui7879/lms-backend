import { getMockUser } from '@lms/auth';
import type { CourseMetadata } from '@lms/contracts';
import type {
  FindManyOptions,
  FindOperator,
  FindOptionsWhere,
  Repository,
} from 'typeorm';
import { courseData, CoursesService } from './courses.service';
import { Course } from './entities/course.entity';
import { sanitizeRichText } from '../../common/rich-text';

jest.mock(
  '../../common/rich-text',
  () => ({
    sanitizeRichText: jest.fn(() => '<p>safe</p>'),
  }),
  { virtual: true },
);

const user = getMockUser('instructorA');
const metadata: CourseMetadata = {
  subtitle: 'Subtitle',
  category: 'Development',
  tags: ['typescript'],
  level: 'BEGINNER',
  language: 'en-US',
  prerequisites: ['Basics'],
  targetAudience: ['Developers'],
  learningOutcomes: ['Build apps'],
  descriptionFormat: 'HTML',
};
const row = (extra: Partial<Course> = {}): Course => ({
  id: 'course',
  instructorId: user.id,
  title: 'Title',
  description: 'Description',
  thumbnailUrl: null,
  status: 'DRAFT',
  version: 1,
  contentVersion: 1,
  metadata: {},
  publishedRevisionId: null,
  initialPublishedContentVersion: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  ...extra,
});

function setup(current = row()) {
  const repository = {
    create: jest.fn((input) => row(input)),
    save: jest.fn(async (input) => input),
    findOneBy: jest.fn(async () => current),
    update: jest.fn(async (_criteria: unknown, _changes: unknown) => ({
      affected: 1,
    })),
    findOneByOrFail: jest.fn(async () => current),
    findAndCount: jest.fn(async (_options: FindManyOptions<Course>) => [[], 0]),
  };
  const service = new CoursesService(
    repository as unknown as Repository<Course>,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { repository, service };
}

beforeEach(() => jest.clearAllMocks());

it('flattens all metadata and supports legacy rows without metadata', () => {
  expect(courseData(row({ metadata }))).toMatchObject(metadata);
  expect(courseData(row({ metadata: undefined as never }))).not.toHaveProperty(
    'metadata',
  );
  expect(
    courseData(row({ metadata: { title: 'unsafe' } as never })).title,
  ).toBe('Title');
});

it('persists optional metadata on create and sanitizes HTML', async () => {
  const { repository, service } = setup();
  const result = await service.create(
    { title: 'Title', description: '<script>x</script>', ...metadata },
    user,
  );
  expect(repository.create).toHaveBeenCalledWith(
    expect.objectContaining({ metadata, description: '<p>safe</p>' }),
  );
  expect(result).toMatchObject(metadata);
  expect(sanitizeRichText).toHaveBeenCalledWith('<script>x</script>');
});

it('leaves plain text unchanged', async () => {
  const { repository, service } = setup();
  await service.create({ title: 'Title', description: '<example>' }, user);
  expect(repository.create).toHaveBeenCalledWith(
    expect.objectContaining({ description: '<example>', metadata: {} }),
  );
  expect(sanitizeRichText).not.toHaveBeenCalled();
});

it('merges metadata PATCH, preserves omitted values, and accepts empty arrays', async () => {
  const { repository, service } = setup(row({ metadata }));
  await service.update(
    'course',
    { expectedVersion: 1, tags: [], subtitle: 'Changed' },
    user,
  );
  expect(repository.update).toHaveBeenCalledWith(
    { id: 'course', instructorId: user.id, version: 1 },
    { metadata: { ...metadata, tags: [], subtitle: 'Changed' }, version: 2 },
  );
});

it('sanitizes description PATCH using the stored HTML format', async () => {
  const { repository, service } = setup(row({ metadata }));
  await service.update(
    'course',
    { expectedVersion: 1, description: '<script>x</script>' },
    user,
  );
  expect(repository.update.mock.calls[0][1]).toEqual({
    description: '<p>safe</p>',
    version: 2,
  });
});

it('sanitizes an existing description when switching to HTML', async () => {
  const { repository, service } = setup();
  await service.update(
    'course',
    { expectedVersion: 1, descriptionFormat: 'HTML' },
    user,
  );
  expect(sanitizeRichText).toHaveBeenCalledWith('Description');
  expect(repository.update.mock.calls[0][1]).toMatchObject({
    description: '<p>safe</p>',
    metadata: { descriptionFormat: 'HTML' },
  });
});

it('rejects a PATCH containing only omitted fields', async () => {
  const { repository, service } = setup();
  await expect(
    service.update('course', { expectedVersion: 1, category: undefined }, user),
  ).rejects.toThrow();
  expect(repository.update).not.toHaveBeenCalled();
});

it.each([false, true])(
  'ANDs metadata filters into both search branches (instructor: %s)',
  async (instructor) => {
    const { repository, service } = setup();
    const query = {
      search: 'hello',
      instructorId: 'someone-else',
      category: "Dev'ops",
      tag: 'typescript',
      level: 'BEGINNER' as const,
      language: 'en-US',
    };
    if (instructor)
      await service.listInstructorCourses({ ...query, status: 'DRAFT' }, user);
    else await service.list(query);
    const options = repository.findAndCount.mock.calls[0][0];
    expect(options.where).toHaveLength(2);
    for (const branch of options.where as FindOptionsWhere<Course>[]) {
      expect(branch.instructorId).toBe(instructor ? user.id : 'someone-else');
      expect(branch.status).toBe(instructor ? 'DRAFT' : 'PUBLISHED');
      const filter = branch.metadata as FindOperator<CourseMetadata>;
      expect(filter.type).toBe('raw');
      expect(filter.getSql!('course.metadata')).toBe(
        'course.metadata @> CAST(:courseMetadata AS jsonb)',
      );
      expect(
        JSON.parse(filter.objectLiteralParameters!.courseMetadata as string),
      ).toEqual({
        category: "Dev'ops",
        tags: ['typescript'],
        level: 'BEGINNER',
        language: 'en-US',
      });
    }
  },
);
