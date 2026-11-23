import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { getMockUser } from '@lms/auth';
import { DiscussionsController } from '../src/modules/discussions/discussions.controller';
import { DiscussionsService } from '../src/modules/discussions/discussions.service';
import { Discussion } from '../src/modules/discussions/discussion.entity';
import { Course } from '../src/modules/courses/entities/course.entity';
import { Enrollment } from '../src/modules/enrollments/entities/enrollment.entity';
import { Lesson } from '../src/modules/lessons/entities/lesson.entity';

describe('Discussions HTTP with persistence doubles', () => {
  let app: INestApplication;
  const courseId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const lessonId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const student = getMockUser('studentA');
  let enrolled = true;
  let row: Discussion;
  const manager = {
    findOneBy: jest.fn(async (entity: unknown) => {
      if (entity === Course)
        return {
          id: courseId,
          instructorId: getMockUser('instructorA').id,
          contentVersion: 1,
          initialPublishedContentVersion: 1,
        };
      if (entity === Enrollment) return enrolled ? { contentVersion: 1 } : null;
      if (entity === Lesson) return { id: lessonId, revisionId: null };
      return null;
    }),
    findOne: jest.fn(async () => row),
    findAndCount: jest.fn(async () => [[row], 1]),
    create: jest.fn((_entity: unknown, value: object) => value),
    save: jest.fn(async (_entity: unknown, value: object) => ({
      ...row,
      ...value,
    })),
    delete: jest.fn(),
  };
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.MOCK_AUTH = 'true';
    const module = await Test.createTestingModule({
      controllers: [DiscussionsController],
      providers: [
        DiscussionsService,
        {
          provide: DataSource,
          useValue: {
            manager,
            transaction: (work: (manager: unknown) => unknown) => work(manager),
          },
        },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  beforeEach(() => {
    enrolled = true;
    row = {
      id,
      courseId,
      lessonId: null,
      parentId: null,
      authorId: student.id,
      body: 'Question',
      version: 1,
      pinned: false,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    };
    jest.clearAllMocks();
  });
  afterAll(async () => app.close());
  it('lists discussion DTOs and enforces enrollment', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/courses/${courseId}/discussions`)
      .set('x-mock-user', 'studentA')
      .expect(200);
    expect(response.body.data.items[0].authorId).toBe(student.id);
    enrolled = false;
    await request(app.getHttpServer())
      .get(`/api/v1/courses/${courseId}/discussions`)
      .set('x-mock-user', 'studentA')
      .expect(403);
  });
  it('creates with server-owned author and sanitizes markup', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/courses/${courseId}/discussions`)
      .set('x-mock-user', 'studentA')
      .send({ body: '<script>alert(1)</script>' })
      .expect(201);
    expect(response.body.data.body).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    );
    expect(response.body.data.authorId).toBe(student.id);
    await request(app.getHttpServer())
      .post(`/api/v1/courses/${courseId}/discussions`)
      .set('x-mock-user', 'studentA')
      .send({ body: 'Hi', authorId: student.id })
      .expect(400);
  });
  it('rejects cross-course parents and nested replies', async () => {
    row.courseId = lessonId;
    await request(app.getHttpServer())
      .post(`/api/v1/courses/${courseId}/discussions`)
      .set('x-mock-user', 'studentA')
      .send({ body: 'Reply', parentId: id })
      .expect(422);
    row.courseId = courseId;
    row.parentId = lessonId;
    await request(app.getHttpServer())
      .post(`/api/v1/courses/${courseId}/discussions`)
      .set('x-mock-user', 'studentA')
      .send({ body: 'Reply', parentId: id })
      .expect(422);
  });
  it('checks author and version before updating', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/discussions/${id}`)
      .set('x-mock-user', 'studentB')
      .send({ body: 'Edited', expectedVersion: 1 })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/v1/discussions/${id}`)
      .set('x-mock-user', 'instructorA')
      .send({ body: 'Edited', expectedVersion: 1 })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/v1/discussions/${id}`)
      .set('x-mock-user', 'studentA')
      .send({ body: 'Edited', expectedVersion: 2 })
      .expect(409);
    const response = await request(app.getHttpServer())
      .patch(`/api/v1/discussions/${id}`)
      .set('x-mock-user', 'studentA')
      .send({ body: 'Edited', expectedVersion: 1 })
      .expect(200);
    expect(response.body.data.version).toBe(2);
  });
  it('permits owner moderation and limits pin to owner or admin', async () => {
    await request(app.getHttpServer())
      .put(`/api/v1/discussions/${id}/pin`)
      .set('x-mock-user', 'studentA')
      .send({ pinned: true, expectedVersion: 1 })
      .expect(403);
    const response = await request(app.getHttpServer())
      .put(`/api/v1/discussions/${id}/pin`)
      .set('x-mock-user', 'instructorA')
      .send({ pinned: true, expectedVersion: 1 })
      .expect(200);
    expect(response.body.data.pinned).toBe(true);
    await request(app.getHttpServer())
      .delete(`/api/v1/discussions/${id}`)
      .set('x-mock-user', 'instructorA')
      .send({ expectedVersion: 2 })
      .expect(204);
    expect(manager.delete).toHaveBeenCalledWith(Discussion, { parentId: id });
  });
});
