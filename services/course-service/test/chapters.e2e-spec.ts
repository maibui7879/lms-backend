import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { getMockUser } from '@lms/auth';
import { parseContract } from '@lms/contracts';
import { HttpExceptionFilter } from '../src/common/http-exception.filter';
import { requestContext } from '../src/common/request-context';
import { ChaptersController } from '../src/modules/chapters/chapters.controller';
import { ChaptersService } from '../src/modules/chapters/chapters.service';
import { Chapter } from '../src/modules/chapters/entities/chapter.entity';
import { Course } from '../src/modules/courses/entities/course.entity';
import { CourseRevision } from '../src/modules/course-revisions/entities/course-revision.entity';

describe('Chapter endpoints (HTTP with repository test doubles)', () => {
  let app: INestApplication;
  const courseId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const chapterA = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const chapterB = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const owner = getMockUser('instructorA');
  const courseRepository = {
    findOneBy: jest.fn(),
    update: jest.fn(),
  };
  const revisionRepository = { findOneBy: jest.fn() };
  const chapterRepository = {
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
  const manager = { update: jest.fn() };
  const dataSource = {
    transaction: jest.fn(async (callback: (value: typeof manager) => unknown) =>
      callback(manager),
    ),
  };

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
  const chapter = (id: string, order: number, version = 1) => ({
    id,
    courseId,
    title: `Chapter ${order}`,
    order,
    version,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  });

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.MOCK_AUTH = 'true';
    const module = await Test.createTestingModule({
      controllers: [ChaptersController],
      providers: [
        ChaptersService,
        { provide: getRepositoryToken(Chapter), useValue: chapterRepository },
        { provide: getRepositoryToken(Course), useValue: courseRepository },
        {
          provide: getRepositoryToken(CourseRevision),
          useValue: revisionRepository,
        },
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
    chapterRepository.findOne.mockResolvedValue(null);
    chapterRepository.findOneBy.mockResolvedValue(null);
    chapterRepository.findOneByOrFail.mockResolvedValue(
      chapter(chapterA, 1, 2),
    );
    chapterRepository.find.mockResolvedValue([]);
    chapterRepository.save.mockImplementation(
      async (value: Record<string, unknown>) => ({
        ...value,
        id: chapterA,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
    );
    chapterRepository.update.mockResolvedValue({ affected: 1 });
    chapterRepository.delete.mockResolvedValue({ affected: 1 });
    chapterRepository.createQueryBuilder.mockReturnValue({
      update: () => ({
        set: () => ({
          where: () => ({
            execute: jest.fn().mockResolvedValue({ affected: 0 }),
          }),
        }),
      }),
    });
    manager.update.mockResolvedValue({ affected: 1 });
  });

  afterAll(async () => app?.close());

  it('creates a chapter at the end of the course', async () => {
    chapterRepository.findOne.mockResolvedValue(chapter(chapterA, 1));
    const result = await request(app.getHttpServer())
      .post(`/api/v1/courses/${courseId}/chapters`)
      .set('x-mock-user', 'instructorA')
      .send({ title: 'Chapter 2' })
      .expect(201);
    expect(chapterRepository.create).toHaveBeenCalledWith({
      courseId,
      revisionId: null,
      title: 'Chapter 2',
      order: 2,
      version: 1,
    });
    expect(result.body.data).toMatchObject({ courseId, order: 2, version: 1 });
    parseContract('ChapterData', result.body.data);
  });

  it('updates and deletes a chapter with ownership and version checks', async () => {
    chapterRepository.findOneBy.mockResolvedValue(chapter(chapterA, 1));
    chapterRepository.findOneByOrFail.mockResolvedValue(
      chapter(chapterA, 1, 2),
    );
    const updated = await request(app.getHttpServer())
      .patch(`/api/v1/chapters/${chapterA}`)
      .set('x-mock-user', 'instructorA')
      .send({ title: 'Updated', expectedVersion: 1 })
      .expect(200);
    expect(updated.body.data.version).toBe(2);

    chapterRepository.findOneBy.mockResolvedValue(chapter(chapterA, 1, 2));
    await request(app.getHttpServer())
      .delete(`/api/v1/chapters/${chapterA}`)
      .set('x-mock-user', 'instructorA')
      .send({ expectedVersion: 1 })
      .expect(409);
    await request(app.getHttpServer())
      .delete(`/api/v1/chapters/${chapterA}`)
      .set('x-mock-user', 'instructorA')
      .send({ expectedVersion: 2 })
      .expect(204);
  });

  it('reorders every chapter and returns a course outline', async () => {
    chapterRepository.find
      .mockResolvedValueOnce([chapter(chapterA, 1), chapter(chapterB, 2)])
      .mockResolvedValueOnce([
        chapter(chapterB, 1, 2),
        chapter(chapterA, 2, 2),
      ]);
    const result = await request(app.getHttpServer())
      .put(`/api/v1/courses/${courseId}/chapters/order`)
      .set('x-mock-user', 'instructorA')
      .send({ orderedIds: [chapterB, chapterA], expectedVersion: 1 })
      .expect(200);
    expect(dataSource.transaction).toHaveBeenCalled();
    expect(result.body.data).toMatchObject({ courseId, contentVersion: 2 });
    expect(
      result.body.data.chapters.map((item: { id: string }) => item.id),
    ).toEqual([chapterB, chapterA]);
  });

  it('rejects invalid payloads, non-owners and published courses', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/courses/${courseId}/chapters`)
      .set('x-mock-user', 'studentA')
      .send({ title: 'Chapter' })
      .expect(403);
    await request(app.getHttpServer())
      .post(`/api/v1/courses/${courseId}/chapters`)
      .set('x-mock-user', 'instructorA')
      .send({ title: '' })
      .expect(400);
    courseRepository.findOneBy.mockResolvedValue({
      ...course(),
      status: 'PUBLISHED',
    });
    await request(app.getHttpServer())
      .post(`/api/v1/courses/${courseId}/chapters`)
      .set('x-mock-user', 'instructorA')
      .send({ title: 'Blocked' })
      .expect(409);
  });
});
