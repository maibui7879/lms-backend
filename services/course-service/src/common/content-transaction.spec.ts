import { getMockUser } from '@lms/auth';
import { ChaptersService } from '../modules/chapters/chapters.service';
import { LessonsService } from '../modules/lessons/lessons.service';
import { LearningItemsService } from '../modules/learning-items/learning-items.service';
import { Course } from '../modules/courses/entities/course.entity';
import { CourseRevision } from '../modules/course-revisions/entities/course-revision.entity';
import { Chapter } from '../modules/chapters/entities/chapter.entity';
import { Lesson } from '../modules/lessons/entities/lesson.entity';
import { LearningItem } from '../modules/learning-items/entities/learning-item.entity';

const owner = getMockUser('instructorA');

function fixture() {
  const rows = new Map<unknown, any[]>([
    [
      Course,
      [
        {
          id: 'course',
          instructorId: owner.id,
          status: 'DRAFT',
          version: 1,
          contentVersion: 1,
        },
      ],
    ],
    [CourseRevision, []],
    [
      Chapter,
      [
        {
          id: 'chapter',
          courseId: 'course',
          revisionId: null,
          order: 1,
          version: 1,
        },
      ],
    ],
    [
      Lesson,
      [
        {
          id: 'lesson',
          chapterId: 'chapter',
          courseId: 'course',
          revisionId: null,
          order: 1,
          version: 1,
        },
      ],
    ],
    [
      LearningItem,
      [
        {
          id: 'item',
          lessonId: 'lesson',
          courseId: 'course',
          revisionId: null,
          order: 1,
          version: 1,
          type: 'READING',
          body: 'body',
        },
      ],
    ],
  ]);
  const matches = (row: any, where: any) =>
    Object.entries(where).every(([key, value]) =>
      typeof value === 'object' && value !== null
        ? row[key] == null
        : row[key] === value,
    );
  const repositories = new Map(
    [...rows.keys()].map((entity) => [
      entity,
      {
        findOneBy: jest.fn(
          async (where) =>
            rows.get(entity)!.find((row) => matches(row, where)) ?? null,
        ),
        find: jest.fn(async ({ where }) =>
          rows.get(entity)!.filter((row) => matches(row, where)),
        ),
        findOne: jest.fn(
          async ({ where }) =>
            rows
              .get(entity)!
              .filter((row) => matches(row, where))
              .at(-1) ?? null,
        ),
        existsBy: jest.fn(async (where) =>
          rows.get(entity)!.some((row) => matches(row, where)),
        ),
        create: (row: any) => row,
        save: jest.fn(async (row) => {
          const saved = { ...row, id: 'new' };
          rows.get(entity)!.push(saved);
          return saved;
        }),
        update: jest.fn(async (where, changes) => {
          const selected = rows
            .get(entity)!
            .filter((row) => matches(row, where));
          selected.forEach((row) => Object.assign(row, changes));
          return { affected: selected.length };
        }),
        delete: jest.fn(async (where) => {
          const before = rows.get(entity)!;
          const after = before.filter((row) => !matches(row, where));
          rows.set(entity, after);
          return { affected: before.length - after.length };
        }),
        createQueryBuilder: () => ({
          update: () => ({
            set: () => ({
              where: () => ({ execute: async () => ({ affected: 0 }) }),
            }),
          }),
        }),
      },
    ]),
  );
  const manager = {
    getRepository: (entity: unknown) => repositories.get(entity)!,
    findOne: jest.fn(async (entity, options) =>
      repositories.get(entity)!.findOneBy(options.where),
    ),
  };
  const source = {
    transaction: jest.fn(async (_isolation, work) => {
      const snapshot = new Map(
        [...rows].map(([key, value]) => [key, structuredClone(value)]),
      );
      try {
        return await work(manager);
      } catch (error) {
        rows.clear();
        snapshot.forEach((value, key) => rows.set(key, value));
        throw error;
      }
    }),
  };
  // Constructors are intentionally supplied only transaction repositories.
  const repo = (entity: unknown): any => {
    const value = repositories.get(entity)!;
    Object.assign(value, { manager: { ...manager, connection: source } });
    return value;
  };
  const chapters = new ChaptersService(
    repo(Chapter),
    repo(Course),
    repo(CourseRevision),
    source as never,
  );
  const lessons = new LessonsService(
    repo(Lesson),
    repo(Chapter),
    repo(Course),
    repo(CourseRevision),
  );
  const items = new LearningItemsService(
    repo(LearningItem),
    repo(Lesson),
    repo(Chapter),
    repo(Course),
    repo(CourseRevision),
  );
  return { rows, repo, manager, source, services: [chapters, lessons, items] };
}

describe('Outline transactions', () => {
  const cases = [0, 1, 2].flatMap((index) =>
    [false, true].map((revision) => ({ index, revision })),
  );

  function prepareRevision(f: ReturnType<typeof fixture>, revision: boolean) {
    if (!revision) return;
    f.rows.set(CourseRevision, [
      {
        id: 'revision',
        courseId: 'course',
        status: 'DRAFT',
        version: 7,
        baseContentVersion: 1,
      },
    ]);
    for (const entity of [Chapter, Lesson, LearningItem])
      f.rows.get(entity)!.forEach((row) => {
        row.revisionId = 'revision';
      });
  }

  it.each(cases)(
    'creates under the course lock and rolls back on aggregate CAS failure ($index, revision=$revision)',
    async ({ index, revision }) => {
      const f = fixture();
      prepareRevision(f, revision);
      const aggregate = revision ? CourseRevision : Course;
      const entity = [Chapter, Lesson, LearningItem][index];
      const expectedVersion = revision ? 7 : 1;
      f.repo(aggregate).update.mockResolvedValue({ affected: 0 });
      const dto = {
        title: 'new',
        ...(revision ? { revisionId: 'revision' } : {}),
      };
      const operation =
        index === 0
          ? f.services[0].create('course', dto, owner)
          : index === 1
            ? f.services[1].create('chapter', dto, owner)
            : f.services[2].create(
                'lesson',
                {
                  ...dto,
                  type: 'READING',
                  body: 'body',
                  required: true,
                },
                owner,
              );
      await expect(operation).rejects.toMatchObject({ status: 409 });
      expect(f.rows.get(entity)).toHaveLength(1);
      expect(f.repo(aggregate).update).toHaveBeenCalledWith(
        { id: revision ? 'revision' : 'course', version: expectedVersion },
        expect.objectContaining({ version: expectedVersion + 1 }),
      );
      const lockCall = f.manager.findOne.mock.calls.findIndex(
        ([, options]) => options.lock?.mode === 'pessimistic_write',
      );
      expect(lockCall).toBeGreaterThanOrEqual(0);
      expect(f.manager.findOne.mock.invocationCallOrder[lockCall]).toBeLessThan(
        f.repo(entity).save.mock.invocationCallOrder[0],
      );
      expect(f.manager.findOne.mock.calls[lockCall]).toEqual([
        Course,
        { where: { id: 'course' }, lock: { mode: 'pessimistic_write' } },
      ]);
    },
  );

  it.each([0, 1, 2])(
    'rolls back reorder when revision CAS affects no row (%i)',
    async (index) => {
      const f = fixture();
      prepareRevision(f, true);
      f.repo(CourseRevision).update.mockResolvedValue({ affected: 0 });
      await expect(
        f.services[index].reorder(
          ['course', 'chapter', 'lesson'][index],
          {
            revisionId: 'revision',
            expectedVersion: 7,
            orderedIds: [['chapter'], ['lesson'], ['item']][index],
          },
          owner,
        ),
      ).rejects.toMatchObject({ status: 409 });
      expect(f.repo(CourseRevision).update).toHaveBeenCalledWith(
        { id: 'revision', version: 7 },
        { version: 8 },
      );
      expect(
        f.rows.get([Chapter, Lesson, LearningItem][index])![0].version,
      ).toBe(1);
      expect(f.repo(Course).update).not.toHaveBeenCalled();
    },
  );

  it.each([0, 1, 2])(
    'rolls back deletion when revision CAS affects no row (%i)',
    async (index) => {
      const f = fixture();
      prepareRevision(f, true);
      if (index === 0) f.rows.set(Lesson, []);
      if (index === 1) f.rows.set(LearningItem, []);
      f.repo(CourseRevision).update.mockResolvedValue({ affected: 0 });
      await expect(
        f.services[index].remove(
          ['chapter', 'lesson', 'item'][index],
          { revisionId: 'revision', expectedVersion: 1 },
          owner,
        ),
      ).rejects.toMatchObject({ status: 409 });
      expect(f.repo(CourseRevision).update).toHaveBeenCalledWith(
        { id: 'revision', version: 7 },
        { version: 8 },
      );
      expect(f.rows.get([Chapter, Lesson, LearningItem][index])).toHaveLength(
        1,
      );
      expect(f.repo(Course).update).not.toHaveBeenCalled();
    },
  );

  it.each([0, 1])('blocks deleting a nonempty parent (%i)', async (index) => {
    const f = fixture();
    await expect(
      f.services[index].remove(
        index === 0 ? 'chapter' : 'lesson',
        { expectedVersion: 1 },
        owner,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      f.repo(index === 0 ? Chapter : Lesson).delete,
    ).not.toHaveBeenCalled();
    expect(f.repo(Course).update).not.toHaveBeenCalled();
  });

  it.each([0, 1, 2])(
    'rolls back a delete if the aggregate version update loses (%i)',
    async (index) => {
      const f = fixture();
      if (index === 0) f.rows.set(Lesson, []);
      if (index === 1) f.rows.set(LearningItem, []);
      f.repo(Course).update.mockResolvedValue({ affected: 0 });
      const entity = [Chapter, Lesson, LearningItem][index];
      const id = ['chapter', 'lesson', 'item'][index];
      await expect(
        f.services[index].remove(id, { expectedVersion: 1 }, owner),
      ).rejects.toMatchObject({ status: 409 });
      expect(f.rows.get(entity)).toHaveLength(1);
    },
  );

  it.each([0, 1, 2])(
    'checks row versions and rolls back a reorder on zero affected rows (%i)',
    async (index) => {
      const f = fixture();
      const entity = [Chapter, Lesson, LearningItem][index];
      f.repo(entity).update.mockResolvedValue({ affected: 0 });
      await expect(
        f.services[index].reorder(
          ['course', 'chapter', 'lesson'][index],
          {
            expectedVersion: 1,
            orderedIds: [['chapter'], ['lesson'], ['item']][index],
          },
          owner,
        ),
      ).rejects.toMatchObject({ status: 409 });
      expect(f.repo(entity).update.mock.calls[0][0]).toMatchObject({
        version: 1,
      });
      expect(f.rows.get(Course)![0].version).toBe(1);
    },
  );

  it.each([0, 1, 2])(
    'rolls back reordered children when the aggregate bump fails (%i)',
    async (index) => {
      const f = fixture();
      f.repo(Course).update.mockResolvedValue({ affected: 0 });
      await expect(
        f.services[index].reorder(
          ['course', 'chapter', 'lesson'][index],
          {
            expectedVersion: 1,
            orderedIds: [['chapter'], ['lesson'], ['item']][index],
          },
          owner,
        ),
      ).rejects.toMatchObject({ status: 409 });
      expect(
        f.rows.get([Chapter, Lesson, LearningItem][index])![0].version,
      ).toBe(1);
    },
  );

  it('locks the same course before creating a lesson or deleting its chapter, and rereads the parent', async () => {
    const f = fixture();
    await f.services[1].create('chapter', { title: 'new' }, owner);
    expect(f.manager.findOne).toHaveBeenCalledWith(Course, {
      where: { id: 'course' },
      lock: { mode: 'pessimistic_write' },
    });
    expect(f.repo(Chapter).findOneBy).toHaveBeenCalledTimes(2);
    await expect(
      f.services[0].remove('chapter', { expectedVersion: 1 }, owner),
    ).rejects.toMatchObject({ status: 409 });
    expect(f.source.transaction).toHaveBeenCalledWith(
      'READ COMMITTED',
      expect.any(Function),
    );
  });

  it.each([0, 1, 2])(
    'deletes and compacts sibling orders with version bumps (%i)',
    async (index) => {
      const f = fixture();
      const entity = [Chapter, Lesson, LearningItem][index];
      const id = ['chapter', 'lesson', 'item'][index];
      if (index === 0) f.rows.set(Lesson, []);
      if (index === 1) f.rows.set(LearningItem, []);
      f.rows.get(entity)!.push({
        ...f.rows.get(entity)![0],
        id: 'sibling',
        order: 2,
        version: 5,
      });
      await f.services[index].remove(id, { expectedVersion: 1 }, owner);
      expect(f.rows.get(entity)).toMatchObject([
        { id: 'sibling', order: 1, version: 6 },
      ]);
      expect(f.rows.get(Course)![0]).toMatchObject({
        version: 2,
        contentVersion: 2,
      });
    },
  );

  it.each([0, 1])(
    'rereads a parent deleted while child creation waits for the course lock (%i)',
    async (index) => {
      const f = fixture();
      const parent = [Chapter, Lesson][index];
      f.manager.findOne.mockImplementation(async (entity, options) => {
        const result = await f.repo(entity).findOneBy(options.where);
        if (entity === Course) f.rows.set(parent, []);
        return result;
      });
      const operation =
        index === 0
          ? f.services[1].create('chapter', { title: 'new' }, owner)
          : f.services[2].create(
              'lesson',
              { type: 'READING', title: 'new', body: 'body', required: true },
              owner,
            );
      await expect(operation).rejects.toMatchObject({ status: 404 });
      expect(
        f.repo(index === 0 ? Lesson : LearningItem).save,
      ).not.toHaveBeenCalled();
    },
  );
});
