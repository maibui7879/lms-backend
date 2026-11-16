import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { getMockUser } from '@lms/auth';
import { parseContract } from '@lms/contracts';
import { HttpExceptionFilter } from '../src/common/http-exception.filter';
import { requestContext } from '../src/common/request-context';
import { LearningItemsController } from '../src/modules/learning-items/learning-items.controller';
import { LearningItemsService } from '../src/modules/learning-items/learning-items.service';
import { LearningItem } from '../src/modules/learning-items/entities/learning-item.entity';
import { Lesson } from '../src/modules/lessons/entities/lesson.entity';
import { Chapter } from '../src/modules/chapters/entities/chapter.entity';
import { Course } from '../src/modules/courses/entities/course.entity';
import { CourseRevision } from '../src/modules/course-revisions/entities/course-revision.entity';

describe('Learning item endpoints', () => {
  let app: INestApplication;
  const courseId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const chapterId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const lessonId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const itemA = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const itemB = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  const owner = getMockUser('instructorA');
  const courseRepository = { findOneBy: jest.fn(), update: jest.fn() };
  const revisionRepository = { findOneBy: jest.fn() };
  const chapterRepository = { find: jest.fn() };
  const lessonRepository = { findOneBy: jest.fn(), find: jest.fn() };
  const itemRepository = {
    create: jest.fn((value: unknown) => value),
    save: jest.fn(),
    findOne: jest.fn(),
    findOneBy: jest.fn(),
    findOneByOrFail: jest.fn(),
    find: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const course = () => ({
    id: courseId,
    instructorId: owner.id,
    status: 'DRAFT',
    version: 1,
    contentVersion: 1,
  });
  const lesson = () => ({
    id: lessonId,
    courseId,
    chapterId,
    title: 'Lesson',
    order: 1,
    version: 1,
  });
  const item = (id: string, order: number, version = 1) => ({
    id,
    courseId,
    lessonId,
    title: `Item ${order}`,
    type: 'READING',
    videoUrl: null,
    durationSeconds: null,
    body: `Body ${order}`,
    quizId: null,
    assessmentVersion: null,
    required: true,
    order,
    contentVersion: 1,
    version,
  });

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.MOCK_AUTH = 'true';
    const module = await Test.createTestingModule({
      controllers: [LearningItemsController],
      providers: [
        LearningItemsService,
        { provide: getRepositoryToken(LearningItem), useValue: itemRepository },
        { provide: getRepositoryToken(Lesson), useValue: lessonRepository },
        { provide: getRepositoryToken(Chapter), useValue: chapterRepository },
        { provide: getRepositoryToken(Course), useValue: courseRepository },
        {
          provide: getRepositoryToken(CourseRevision),
          useValue: revisionRepository,
        },
      ],
    }).compile();
    app = module.createNestApplication();
    app.use(requestContext);
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    courseRepository.findOneBy.mockResolvedValue(course());
    courseRepository.update.mockResolvedValue({ affected: 1 });
    lessonRepository.findOneBy.mockResolvedValue(lesson());
    lessonRepository.find.mockResolvedValue([lesson()]);
    chapterRepository.find.mockResolvedValue([
      { id: chapterId, courseId, title: 'Chapter', order: 1, version: 1 },
    ]);
    itemRepository.findOne.mockResolvedValue(null);
    itemRepository.findOneBy.mockResolvedValue(item(itemA, 1));
    itemRepository.findOneByOrFail.mockResolvedValue(item(itemA, 1, 2));
    itemRepository.find.mockResolvedValue([item(itemA, 1), item(itemB, 2)]);
    itemRepository.update.mockResolvedValue({ affected: 1 });
    itemRepository.delete.mockResolvedValue({ affected: 1 });
    itemRepository.save.mockImplementation(
      async (value: Record<string, unknown>) => ({ ...value, id: itemA }),
    );
    itemRepository.createQueryBuilder.mockReturnValue({
      update: () => ({
        set: () => ({
          where: () => ({
            execute: jest.fn().mockResolvedValue({ affected: 0 }),
          }),
        }),
      }),
    });
  });

  afterAll(async () => app?.close());

  it('creates, updates and deletes a reading item with optimistic version checks', async () => {
    itemRepository.findOne.mockResolvedValue(null);
    const created = await request(app.getHttpServer())
      .post(`/api/v1/lessons/${lessonId}/items`)
      .set('x-mock-user', 'instructorA')
      .send({
        type: 'READING',
        title: 'Reading',
        body: 'Content',
        required: true,
      })
      .expect(201);
    expect(created.body.data).toMatchObject({
      type: 'READING',
      lessonId,
      order: 1,
      version: 1,
    });
    parseContract('LearningItemData', created.body.data);

    itemRepository.findOneBy.mockResolvedValue(item(itemA, 1));
    itemRepository.findOneByOrFail.mockResolvedValue({
      ...item(itemA, 1, 2),
      title: 'Updated',
    });
    await request(app.getHttpServer())
      .patch(`/api/v1/learning-items/${itemA}`)
      .set('x-mock-user', 'instructorA')
      .send({
        type: 'VIDEO',
        title: 'Updated',
        videoUrl: 'https://video.test/1',
        durationSeconds: 60,
        required: false,
        expectedVersion: 1,
      })
      .expect(200);

    itemRepository.findOneBy.mockResolvedValue(item(itemA, 1, 2));
    await request(app.getHttpServer())
      .delete(`/api/v1/learning-items/${itemA}`)
      .set('x-mock-user', 'instructorA')
      .send({ expectedVersion: 2 })
      .expect(204);
  });

  it('reorders every item and returns the course outline', async () => {
    itemRepository.find
      .mockResolvedValueOnce([item(itemA, 1), item(itemB, 2)])
      .mockResolvedValueOnce([item(itemB, 1, 2), item(itemA, 2, 2)]);
    const result = await request(app.getHttpServer())
      .put(`/api/v1/lessons/${lessonId}/items/order`)
      .set('x-mock-user', 'instructorA')
      .send({ orderedIds: [itemB, itemA], expectedVersion: 1 })
      .expect(200);
    expect(result.body.data.courseId).toBe(courseId);
    expect(
      result.body.data.chapters[0].lessons[0].items.map(
        (value: { id: string }) => value.id,
      ),
    ).toEqual([itemB, itemA]);
  });

  it('rejects invalid payloads, non-owners and published courses', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/lessons/${lessonId}/items`)
      .set('x-mock-user', 'studentA')
      .send({ type: 'READING', title: 'Item', body: 'Body', required: true })
      .expect(403);
    await request(app.getHttpServer())
      .post(`/api/v1/lessons/${lessonId}/items`)
      .set('x-mock-user', 'instructorA')
      .send({ type: 'READING', title: '', body: 'Body', required: true })
      .expect(400);
    courseRepository.findOneBy.mockResolvedValue({
      ...course(),
      status: 'PUBLISHED',
    });
    await request(app.getHttpServer())
      .post(`/api/v1/lessons/${lessonId}/items`)
      .set('x-mock-user', 'instructorA')
      .send({ type: 'READING', title: 'Blocked', body: 'Body', required: true })
      .expect(409);
  });
});
