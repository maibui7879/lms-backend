import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { CoursesModule } from '../src/modules/courses/courses.module';
import { Course } from '../src/modules/courses/entities/course.entity';
import { Chapter } from '../src/modules/chapters/entities/chapter.entity';
import { Lesson } from '../src/modules/lessons/entities/lesson.entity';
import { LearningItem } from '../src/modules/learning-items/entities/learning-item.entity';
import { Enrollment } from '../src/modules/enrollments/entities/enrollment.entity';
import { HttpExceptionFilter } from '../src/common/http-exception.filter';
import { requestContext } from '../src/common/request-context';
import { getMockUser } from '@lms/auth';
import { parseContract } from '@lms/contracts';

describe('POST courses (HTTP with repository test double)', () => {
  let app: INestApplication;
  const oldEnv = { ...process.env };
  const repository = {
    create: jest.fn((value: unknown) => value),
    save: jest.fn(),
    findAndCount: jest.fn(),
    findOneBy: jest.fn(),
    findOneByOrFail: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const chapterRepository = { find: jest.fn() };
  const lessonRepository = { find: jest.fn() };
  const itemRepository = { find: jest.fn() };
  const enrollmentRepository = {
    findOneBy: jest.fn(),
    findAndCount: jest.fn(),
  };
  const body = {
    title: 'NestJS Fundamentals',
    description: 'Learn NestJS from scratch',
    thumbnailUrl: null,
  };
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.MOCK_AUTH = 'true';
    const module = await Test.createTestingModule({ imports: [CoursesModule] })
      .overrideProvider(getRepositoryToken(Course))
      .useValue(repository)
      .overrideProvider(getRepositoryToken(Chapter))
      .useValue(chapterRepository)
      .overrideProvider(getRepositoryToken(Lesson))
      .useValue(lessonRepository)
      .overrideProvider(getRepositoryToken(LearningItem))
      .useValue(itemRepository)
      .overrideProvider(getRepositoryToken(Enrollment))
      .useValue(enrollmentRepository)
      .compile();
    app = module.createNestApplication();
    app.use(requestContext);
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });
  beforeEach(() => {
    repository.create.mockClear();
    repository.save.mockReset();
    repository.findAndCount.mockReset();
    repository.findOneBy.mockReset();
    repository.findOneByOrFail.mockReset();
    repository.update.mockReset();
    repository.delete.mockReset();
    chapterRepository.find.mockReset();
    lessonRepository.find.mockReset();
    itemRepository.find.mockReset();
    enrollmentRepository.findOneBy.mockReset();
    enrollmentRepository.findAndCount.mockReset();
    repository.save.mockImplementation((row: Record<string, unknown>) =>
      Promise.resolve({
        ...row,
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );
    repository.findAndCount.mockResolvedValue([[], 0]);
    repository.findOneBy.mockResolvedValue(null);
    repository.findOneByOrFail.mockResolvedValue(null);
    repository.update.mockResolvedValue({ affected: 1 });
    repository.delete.mockResolvedValue({ affected: 1 });
    chapterRepository.find.mockResolvedValue([]);
    lessonRepository.find.mockResolvedValue([]);
    itemRepository.find.mockResolvedValue([]);
    enrollmentRepository.findOneBy.mockResolvedValue(null);
    enrollmentRepository.findAndCount.mockResolvedValue([[], 0]);
    process.env.NODE_ENV = 'test';
    process.env.MOCK_AUTH = 'true';
  });
  afterAll(async () => {
    await app.close();
    process.env = oldEnv;
  });
  it('returns 201 with trusted owner, draft defaults, valid contract and request ID', async () => {
    const result = await request(app.getHttpServer())
      .post('/api/v1/courses')
      .set('x-mock-user', 'instructorA')
      .set('x-request-id', 'course-test')
      .send(body)
      .expect(201);
    expect(result.body.meta.requestId).toBe('course-test');
    expect(result.headers['x-request-id']).toBe('course-test');
    expect(result.body.data).toMatchObject({
      ...body,
      instructorId: getMockUser('instructorA').id,
      status: 'DRAFT',
      version: 1,
      contentVersion: 1,
    });
    parseContract('CourseData', result.body.data);
  });
  it('defaults omitted thumbnail to null', async () => {
    const result = await request(app.getHttpServer())
      .post('/api/v1/courses')
      .set('x-mock-user', 'instructorB')
      .send({ title: 'Other', description: '' })
      .expect(201);
    expect(result.body.data.thumbnailUrl).toBeNull();
    expect(result.body.data.instructorId).toBe(getMockUser('instructorB').id);
  });
  it('rejects missing/unknown identity, Student/Admin and disabled/production mock auth', async () => {
    for (const name of ['', 'unknown', 'studentA', 'adminA']) {
      await request(app.getHttpServer())
        .post('/api/v1/courses')
        .set('x-mock-user', name)
        .send(body)
        .expect(['studentA', 'adminA'].includes(name) ? 403 : 401);
    }
    process.env.MOCK_AUTH = 'false';
    await request(app.getHttpServer())
      .post('/api/v1/courses')
      .set('x-mock-user', 'instructorA')
      .send(body)
      .expect(401);
    process.env.MOCK_AUTH = 'true';
    process.env.NODE_ENV = 'production';
    await request(app.getHttpServer())
      .post('/api/v1/courses')
      .set('x-mock-user', 'instructorA')
      .send(body)
      .expect(401);
    expect(repository.save).not.toHaveBeenCalled();
  });
  it('rejects invalid and server-owned fields without persisting', async () => {
    for (const bad of [
      { ...body, title: ' ' },
      { ...body, title: 'x'.repeat(201) },
      { ...body, instructorId: getMockUser('instructorB').id },
      { ...body, status: 'PUBLISHED' },
      { ...body, thumbnailUrl: 'javascript:alert(1)' },
      { title: 'No description' },
    ]) {
      const result = await request(app.getHttpServer())
        .post('/api/v1/courses')
        .set('x-mock-user', 'instructorA')
        .send(bad)
        .expect(400);
      parseContract('ApiErrorResponse', result.body);
      expect(result.body.error.code).toBe('VALIDATION_ERROR');
    }
    expect(repository.save).not.toHaveBeenCalled();
  });
  it('sanitizes storage errors', async () => {
    repository.save.mockRejectedValue(
      new Error('postgresql://secret@host/private SQL'),
    );
    const result = await request(app.getHttpServer())
      .post('/api/v1/courses')
      .set('x-mock-user', 'instructorA')
      .send(body)
      .expect(503);
    expect(JSON.stringify(result.body)).not.toContain('secret');
    parseContract('ApiErrorResponse', result.body);
  });

  it('lists only published courses and applies all CourseQuery parameters', async () => {
    const published = {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      instructorId: getMockUser('instructorA').id,
      title: 'NestJS Search',
      description: 'Searchable course',
      thumbnailUrl: null,
      status: 'PUBLISHED',
      version: 2,
      contentVersion: 2,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    };
    repository.findAndCount.mockResolvedValue([[published], 1]);

    const result = await request(app.getHttpServer())
      .get('/api/v1/courses')
      .query({
        search: 'Nest',
        instructorId: getMockUser('instructorA').id,
        sort: 'title',
        direction: 'asc',
        page: '2',
        limit: '5',
      })
      .expect(200);

    expect(result.body.data).toMatchObject({
      page: 2,
      limit: 5,
      total: 1,
      items: [{ id: published.id, status: 'PUBLISHED' }],
    });
    expect(repository.findAndCount).toHaveBeenCalledWith({
      where: [
        expect.objectContaining({ status: 'PUBLISHED' }),
        expect.objectContaining({ status: 'PUBLISHED' }),
      ],
      order: { title: 'ASC' },
      skip: 5,
      take: 5,
    });
    parseContract('CourseData', result.body.data.items[0]);
  });

  it('uses default pagination and rejects unknown query parameters', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/courses')
      .query({ unexpected: 'value' })
      .expect(400);

    await request(app.getHttpServer()).get('/api/v1/courses').expect(200);
    expect(repository.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({
        order: { createdAt: 'DESC' },
        skip: 0,
        take: 20,
      }),
    );
  });

  it('gets a published course and hides draft or missing courses', async () => {
    const published = {
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      instructorId: getMockUser('instructorA').id,
      title: 'Published',
      description: 'Visible',
      thumbnailUrl: null,
      status: 'PUBLISHED',
      version: 1,
      contentVersion: 1,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    repository.findOneBy.mockResolvedValueOnce(published);
    const result = await request(app.getHttpServer())
      .get(`/api/v1/courses/${published.id}`)
      .expect(200);
    expect(result.body.data.id).toBe(published.id);

    repository.findOneBy.mockResolvedValueOnce(null);
    await request(app.getHttpServer())
      .get(`/api/v1/courses/${published.id}`)
      .expect(404);
    await request(app.getHttpServer())
      .get('/api/v1/courses/not-a-uuid')
      .expect(400);
  });

  it('returns the nested course outline for an owner preview', async () => {
    const published = {
      id: 'abababab-abab-4aba-8aba-abababababab',
      instructorId: getMockUser('instructorA').id,
      title: 'Course outline',
      description: 'Nested content',
      thumbnailUrl: null,
      status: 'PUBLISHED',
      version: 3,
      contentVersion: 4,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    };
    const chapterId = 'acacacac-acac-4aca-8aca-acacacacacac';
    const lessonId = 'adadadad-adad-4ada-8ada-adadadadadad';
    const itemId = 'aeaeaeae-aeae-4aea-8aea-aeaeaeaeaeae';
    repository.findOneBy.mockResolvedValueOnce(published);
    chapterRepository.find.mockResolvedValueOnce([
      {
        id: chapterId,
        courseId: published.id,
        title: 'Chapter 1',
        order: 1,
        version: 1,
      },
    ]);
    lessonRepository.find.mockResolvedValueOnce([
      {
        id: lessonId,
        courseId: published.id,
        chapterId,
        title: 'Lesson 1',
        order: 1,
        version: 1,
      },
    ]);
    itemRepository.find.mockResolvedValueOnce([
      {
        id: itemId,
        courseId: published.id,
        lessonId,
        title: 'Reading 1',
        type: 'READING',
        videoUrl: null,
        durationSeconds: null,
        body: 'Read this',
        quizId: null,
        assessmentVersion: null,
        required: true,
        order: 1,
        contentVersion: published.contentVersion,
        version: 1,
      },
    ]);

    const result = await request(app.getHttpServer())
      .get(`/api/v1/courses/${published.id}/outline`)
      .set('x-mock-user', 'instructorA')
      .expect(200);

    expect(result.body.data).toMatchObject({
      courseId: published.id,
      contentVersion: published.contentVersion,
      chapters: [
        {
          id: chapterId,
          lessons: [{ id: lessonId, items: [{ id: itemId, type: 'READING' }] }],
        },
      ],
    });
    parseContract('CourseOutlineData', result.body.data);
  });

  it('lists instructor courses and course learners', async () => {
    const owned = {
      id: 'abababab-abab-4aba-8aba-abababababab',
      instructorId: getMockUser('instructorA').id,
      title: 'Owned course',
      description: 'Owned description',
      thumbnailUrl: null,
      status: 'PUBLISHED',
      version: 2,
      contentVersion: 2,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    };
    repository.findAndCount.mockResolvedValueOnce([[owned], 1]);
    const courses = await request(app.getHttpServer())
      .get('/api/v1/instructor/courses')
      .query({ status: 'PUBLISHED', search: 'Owned' })
      .set('x-mock-user', 'instructorA')
      .expect(200);
    expect(courses.body.data).toMatchObject({
      total: 1,
      items: [{ id: owned.id, status: 'PUBLISHED' }],
    });

    const enrollment = {
      id: 'acacacac-acac-4aca-8aca-acacacacacac',
      courseId: owned.id,
      userId: getMockUser('studentA').id,
      status: 'ACTIVE',
      enrolledAt: new Date('2026-01-03T00:00:00.000Z'),
      contentVersion: owned.contentVersion,
    };
    repository.findOneBy.mockResolvedValueOnce(owned);
    enrollmentRepository.findAndCount.mockResolvedValueOnce([[enrollment], 1]);
    const learners = await request(app.getHttpServer())
      .get(`/api/v1/courses/${owned.id}/learners`)
      .set('x-mock-user', 'instructorA')
      .expect(200);
    expect(learners.body.data).toMatchObject({
      total: 1,
      items: [
        {
          userId: getMockUser('studentA').id,
          enrollment: { enrollmentId: enrollment.id, status: 'ACTIVE' },
        },
      ],
    });
  });

  it('updates an owned draft with the expected version and increments version', async () => {
    const current = {
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      instructorId: getMockUser('instructorA').id,
      title: 'Old title',
      description: 'Old description',
      thumbnailUrl: null,
      status: 'DRAFT',
      version: 1,
      contentVersion: 1,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    const updated = { ...current, title: 'New title', version: 2 };
    repository.findOneBy.mockResolvedValueOnce(current);
    repository.findOneByOrFail.mockResolvedValueOnce(updated);

    const result = await request(app.getHttpServer())
      .patch(`/api/v1/courses/${current.id}`)
      .set('x-mock-user', 'instructorA')
      .send({ title: 'New title', expectedVersion: 1 })
      .expect(200);

    expect(result.body.data).toMatchObject({ title: 'New title', version: 2 });
    expect(repository.update).toHaveBeenCalledWith(
      { id: current.id, instructorId: current.instructorId, version: 1 },
      { title: 'New title', version: 2 },
    );
  });

  it('rejects update when not owner, version is stale, or course is published', async () => {
    const base = {
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      instructorId: getMockUser('instructorA').id,
      title: 'Course',
      description: 'Description',
      thumbnailUrl: null,
      status: 'DRAFT',
      version: 2,
      contentVersion: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    repository.findOneBy.mockResolvedValue(base);
    await request(app.getHttpServer())
      .patch(`/api/v1/courses/${base.id}`)
      .set('x-mock-user', 'instructorB')
      .send({ title: 'Changed', expectedVersion: 2 })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/v1/courses/${base.id}`)
      .set('x-mock-user', 'instructorA')
      .send({ title: 'Changed', expectedVersion: 1 })
      .expect(409);

    repository.findOneBy.mockResolvedValue({
      ...base,
      version: 1,
      status: 'PUBLISHED',
    });
    await request(app.getHttpServer())
      .patch(`/api/v1/courses/${base.id}`)
      .set('x-mock-user', 'instructorA')
      .send({ title: 'Changed', expectedVersion: 1 })
      .expect(409);
  });

  it('deletes an owned draft with the expected version', async () => {
    const draft = {
      id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      instructorId: getMockUser('instructorA').id,
      title: 'Draft',
      description: 'Description',
      thumbnailUrl: null,
      status: 'DRAFT',
      version: 1,
      contentVersion: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    repository.findOneBy.mockResolvedValue(draft);
    await request(app.getHttpServer())
      .delete(`/api/v1/courses/${draft.id}`)
      .set('x-mock-user', 'instructorA')
      .send({ expectedVersion: 1 })
      .expect(204);
    expect(repository.delete).toHaveBeenCalledWith({
      id: draft.id,
      instructorId: draft.instructorId,
      version: 1,
    });
  });

  it('rejects delete for non-owner, stale version, published, or invalid payload', async () => {
    const draft = {
      id: '99999999-9999-4999-8999-999999999999',
      instructorId: getMockUser('instructorA').id,
      title: 'Draft',
      description: 'Description',
      thumbnailUrl: null,
      status: 'DRAFT',
      version: 2,
      contentVersion: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    repository.findOneBy.mockResolvedValue(draft);
    await request(app.getHttpServer())
      .delete(`/api/v1/courses/${draft.id}`)
      .set('x-mock-user', 'instructorB')
      .send({ expectedVersion: 2 })
      .expect(403);
    await request(app.getHttpServer())
      .delete(`/api/v1/courses/${draft.id}`)
      .set('x-mock-user', 'instructorA')
      .send({ expectedVersion: 1 })
      .expect(409);

    repository.findOneBy.mockResolvedValue({
      ...draft,
      version: 1,
      status: 'PUBLISHED',
    });
    await request(app.getHttpServer())
      .delete(`/api/v1/courses/${draft.id}`)
      .set('x-mock-user', 'instructorA')
      .send({ expectedVersion: 1 })
      .expect(409);
    await request(app.getHttpServer())
      .delete(`/api/v1/courses/${draft.id}`)
      .set('x-mock-user', 'instructorA')
      .send({})
      .expect(400);
  });
});
