import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/http-exception.filter';
import { InternalServiceGuard } from '../src/common/internal-service.guard';
import { InternalController } from '../src/modules/internal/internal.controller';
import { InternalService } from '../src/modules/internal/internal.service';
import { EnrollmentsService } from '../src/modules/enrollments/enrollments.service';

describe('Course internal service authentication', () => {
  let app: INestApplication;
  const originalToken = process.env.COURSE_SERVICE_TOKEN;
  const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const check = jest.fn().mockResolvedValue({ enrolled: false });
  const internal = {
    checkCourseAccess: jest.fn().mockResolvedValue({}),
    getContentReference: jest.fn().mockResolvedValue({}),
    getLearningStructure: jest.fn().mockResolvedValue({}),
  };
  const routes = [
    `/api/v1/internal/enrollments/check?userId=${id}&courseId=${id}`,
    `/api/v1/internal/courses/access?userId=${id}&courseId=${id}`,
    `/api/v1/internal/quizzes/${id}/reference`,
    `/api/v1/internal/courses/${id}/structure?contentVersion=1`,
  ];

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [InternalController],
      providers: [
        InternalServiceGuard,
        { provide: EnrollmentsService, useValue: { check } },
        { provide: InternalService, useValue: internal },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  beforeEach(() => {
    process.env.COURSE_SERVICE_TOKEN = 'internal-test-secret';
    jest.clearAllMocks();
  });

  afterAll(async () => {
    if (originalToken === undefined) delete process.env.COURSE_SERVICE_TOKEN;
    else process.env.COURSE_SERVICE_TOKEN = originalToken;
    await app.close();
  });

  it.each(routes)(
    'rejects unauthenticated requests before handling %s',
    async (path) => {
      const result = await request(app.getHttpServer()).get(path).expect(401);
      expect(result.body.error.code).toBe('UNAUTHORIZED');
      expect(check).not.toHaveBeenCalled();
      for (const handler of Object.values(internal))
        expect(handler).not.toHaveBeenCalled();
    },
  );

  it.each([
    'Bearer wrong',
    'Bearer internal-test-secreu',
    'Basic internal-test-secret',
    'Bearer user.jwt.token',
  ])('rejects incorrect or user credentials: %s', async (authorization) => {
    await request(app.getHttpServer())
      .get(routes[0])
      .set('Authorization', authorization)
      .set('x-mock-user', 'admin')
      .set('x-user-id', id)
      .set('x-role', 'ADMIN')
      .expect(401);
    expect(check).not.toHaveBeenCalled();
  });

  it.each([undefined, '', '   '])(
    'fails closed for missing configuration %s',
    async (token) => {
      if (token === undefined) delete process.env.COURSE_SERVICE_TOKEN;
      else process.env.COURSE_SERVICE_TOKEN = token;
      const result = await request(app.getHttpServer())
        .get(routes[0])
        .set('Authorization', 'Bearer internal-test-secret')
        .expect(503);
      expect(result.body.error.code).toBe('SERVICE_UNAVAILABLE');
      expect(check).not.toHaveBeenCalled();
      expect(JSON.stringify(result.body)).not.toContain('internal-test-secret');
    },
  );

  it.each(routes)(
    'accepts the configured service credential for %s',
    async (path) => {
      process.env.COURSE_SERVICE_TOKEN = '  internal-test-secret  ';
      await request(app.getHttpServer())
        .get(path)
        .set('Authorization', 'Bearer internal-test-secret')
        .expect(200);
    },
  );
});
