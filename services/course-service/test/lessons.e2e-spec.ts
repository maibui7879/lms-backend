import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { getMockUser } from '@lms/auth';
import { parseContract } from '@lms/contracts';
import { HttpExceptionFilter } from '../src/common/http-exception.filter';
import { requestContext } from '../src/common/request-context';
import { LessonsController } from '../src/modules/lessons/lessons.controller';
import { LessonsService } from '../src/modules/lessons/lessons.service';
import { Chapter } from '../src/modules/chapters/entities/chapter.entity';
import { Course } from '../src/modules/courses/entities/course.entity';
import { Lesson } from '../src/modules/lessons/entities/lesson.entity';

describe('Lesson endpoints (HTTP with repository test doubles)', () => {
  let app: INestApplication;
  const courseId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const chapterId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const lessonA = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const lessonB = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const owner = getMockUser('instructorA');
  const courseRepository = { findOneBy: jest.fn(), update: jest.fn() };
  const chapterRepository = { findOneBy: jest.fn() };
  const lessonRepository = {
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
  const dataSource = { transaction: jest.fn() };

  const course = () => ({
    id: courseId,
    instructorId: owner.id,
    title: 'Course',
    description: 'Description',
    thumbnailUrl: null,
    status: 'DRAFT',
    version: 1,
    contentVersion: 1,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  });
  const chapter = () => ({
    id: chapterId,
    courseId,
    title: 'Chapter',
    order: 1,
    version: 1,
  });
  const lesson = (id: string, order: number, version = 1) => ({
    id,
    courseId,
    chapterId,
    title: `Lesson ${order}`,
    order,
    version,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  });

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.MOCK_AUTH = 'true';
    const module = await Test.createTestingModule({
      controllers: [LessonsController],
      providers: [
        LessonsService,
        { provide: getRepositoryToken(Lesson), useValue: lessonRepository },
        { provide: getRepositoryToken(Chapter), useValue: chapterRepository },
        { provide: getRepositoryToken(Course), useValue: courseRepository },
        { provide: DataSource, useValue: dataSource },
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
    chapterRepository.findOneBy.mockResolvedValue(chapter());
    lessonRepository.findOne.mockResolvedValue(null);
    lessonRepository.findOneBy.mockResolvedValue(null);
    lessonRepository.findOneByOrFail.mockResolvedValue(lesson(lessonA, 1, 2));
    lessonRepository.find.mockResolvedValue([]);
    lessonRepository.save.mockImplementation(async (value: Record<string, unknown>) => ({
      ...value,
      id: lessonA,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    }));
    lessonRepository.update.mockResolvedValue({ affected: 1 });
    lessonRepository.delete.mockResolvedValue({ affected: 1 });
    lessonRepository.createQueryBuilder.mockReturnValue({
      update: () => ({
        set: () => ({
          where: () => ({ execute: jest.fn().mockResolvedValue({ affected: 0 }) }),
        }),
      }),
    });
  });

  afterAll(async () => app?.close());

  it('creates a lesson at the end of the chapter', async () => {
    lessonRepository.findOne.mockResolvedValue(lesson(lessonA, 1));
    const result = await request(app.getHttpServer())
      .post(`/api/v1/chapters/${chapterId}/lessons`)
      .set('x-mock-user', 'instructorA')
      .send({ title: 'Lesson 2' })
      .expect(201);
    expect(lessonRepository.create).toHaveBeenCalledWith({
      courseId,
      chapterId,
      title: 'Lesson 2',
      order: 2,
      version: 1,
    });
    expect(result.body.data).toMatchObject({ courseId, chapterId, order: 2, version: 1 });
    parseContract('LessonData', result.body.data);
  });

  it('updates and deletes a lesson with version checks', async () => {
    lessonRepository.findOneBy.mockResolvedValue(lesson(lessonA, 1));
    lessonRepository.findOneByOrFail.mockResolvedValue(lesson(lessonA, 1, 2));
    const updated = await request(app.getHttpServer())
      .patch(`/api/v1/lessons/${lessonA}`)
      .set('x-mock-user', 'instructorA')
      .send({ title: 'Updated', expectedVersion: 1 })
      .expect(200);
    expect(updated.body.data.version).toBe(2);

    lessonRepository.findOneBy.mockResolvedValue(lesson(lessonA, 1, 2));
    await request(app.getHttpServer())
      .delete(`/api/v1/lessons/${lessonA}`)
      .set('x-mock-user', 'instructorA')
      .send({ expectedVersion: 1 })
      .expect(409);
    await request(app.getHttpServer())
      .delete(`/api/v1/lessons/${lessonA}`)
      .set('x-mock-user', 'instructorA')
      .send({ expectedVersion: 2 })
      .expect(204);
  });

  it('reorders all lessons in the chapter', async () => {
    lessonRepository.find.mockResolvedValueOnce([lesson(lessonA, 1), lesson(lessonB, 2)])
      .mockResolvedValueOnce([lesson(lessonB, 1, 2), lesson(lessonA, 2, 2)]);
    const result = await request(app.getHttpServer())
      .put(`/api/v1/chapters/${chapterId}/lessons/order`)
      .set('x-mock-user', 'instructorA')
      .send({ orderedIds: [lessonB, lessonA], expectedVersion: 1 })
      .expect(200);
    expect(result.body.data.map((item: { id: string }) => item.id))
      .toEqual([lessonB, lessonA]);
  });

  it('rejects invalid payloads, non-owners and published courses', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/chapters/${chapterId}/lessons`)
      .set('x-mock-user', 'studentA')
      .send({ title: 'Lesson' })
      .expect(403);
    await request(app.getHttpServer())
      .post(`/api/v1/chapters/${chapterId}/lessons`)
      .set('x-mock-user', 'instructorA')
      .send({ title: '' })
      .expect(400);
    courseRepository.findOneBy.mockResolvedValue({ ...course(), status: 'PUBLISHED' });
    await request(app.getHttpServer())
      .post(`/api/v1/chapters/${chapterId}/lessons`)
      .set('x-mock-user', 'instructorA')
      .send({ title: 'Blocked' })
      .expect(409);
  });
});
