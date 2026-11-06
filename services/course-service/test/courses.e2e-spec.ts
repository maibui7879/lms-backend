import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { CoursesModule } from '../src/courses/courses.module';
import { Course } from '../src/courses/entities/course.entity';
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
      .compile();
    app = module.createNestApplication();
    app.use(requestContext);
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });
  beforeEach(() => {
    repository.create.mockClear();
    repository.save.mockReset();
    repository.save.mockImplementation((row: Record<string, unknown>) =>
      Promise.resolve({
        ...row,
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );
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
});
