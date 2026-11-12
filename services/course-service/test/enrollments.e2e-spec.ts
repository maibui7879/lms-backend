import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { getMockUser } from '@lms/auth';
import { parseContract } from '@lms/contracts';
import { HttpExceptionFilter } from '../src/common/http-exception.filter';
import { requestContext } from '../src/common/request-context';
import { EnrollmentsController } from '../src/modules/enrollments/enrollments.controller';
import { EnrollmentsService } from '../src/modules/enrollments/enrollments.service';
import { Enrollment } from '../src/modules/enrollments/entities/enrollment.entity';
import { Course } from '../src/modules/courses/entities/course.entity';
import { InternalController } from '../src/modules/internal/internal.controller';

describe('Enrollment endpoints (HTTP with repository test doubles)', () => {
  let app: INestApplication;
  const courseId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const enrollmentId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const student = getMockUser('studentA');
  const courseRepository = { findOneBy: jest.fn(), findBy: jest.fn() };
  const enrollmentRepository = {
    findOneBy: jest.fn(),
    findAndCount: jest.fn(),
    create: jest.fn((value: unknown) => value),
    save: jest.fn(),
    update: jest.fn(),
  };

  const course = () => ({
    id: courseId,
    instructorId: getMockUser('instructorA').id,
    title: 'Published course',
    description: 'Description',
    thumbnailUrl: null,
    status: 'PUBLISHED',
    version: 2,
    contentVersion: 7,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  });

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.MOCK_AUTH = 'true';
    const module = await Test.createTestingModule({
      controllers: [EnrollmentsController, InternalController],
      providers: [
        EnrollmentsService,
        {
          provide: getRepositoryToken(Enrollment),
          useValue: enrollmentRepository,
        },
        { provide: getRepositoryToken(Course), useValue: courseRepository },
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
    courseRepository.findBy.mockResolvedValue([course()]);
    enrollmentRepository.findOneBy.mockResolvedValue(null);
    enrollmentRepository.findAndCount.mockResolvedValue([[], 0]);
    enrollmentRepository.save.mockImplementation(
      async (value: Record<string, unknown>) => ({
        ...value,
        id: enrollmentId,
        enrolledAt: value.enrolledAt ?? new Date('2026-01-02T00:00:00.000Z'),
      }),
    );
    enrollmentRepository.update.mockResolvedValue({ affected: 1 });
  });

  afterAll(async () => app.close());

  it('enrolls an active student and pins the course content version', async () => {
    const result = await request(app.getHttpServer())
      .post(`/api/v1/courses/${courseId}/enrollments`)
      .set('x-mock-user', 'studentA')
      .expect(201);

    expect(result.body.data).toMatchObject({
      enrollmentId,
      courseId,
      userId: student.id,
      status: 'ACTIVE',
      contentVersion: 7,
    });
    parseContract('EnrollmentSnapshotData', result.body.data);
  });

  it('rejects duplicate enrollment and unpublished courses', async () => {
    enrollmentRepository.findOneBy.mockResolvedValue({
      id: enrollmentId,
      courseId,
      userId: student.id,
      status: 'ACTIVE',
      enrolledAt: new Date(),
      contentVersion: 7,
    });
    await request(app.getHttpServer())
      .post(`/api/v1/courses/${courseId}/enrollments`)
      .set('x-mock-user', 'studentA')
      .expect(409);

    courseRepository.findOneBy.mockResolvedValue({
      ...course(),
      status: 'DRAFT',
    });
    enrollmentRepository.findOneBy.mockResolvedValue(null);
    await request(app.getHttpServer())
      .post(`/api/v1/courses/${courseId}/enrollments`)
      .set('x-mock-user', 'studentA')
      .expect(409);
  });

  it('lists active enrollments and checks enrollment internally', async () => {
    const row = {
      id: enrollmentId,
      courseId,
      userId: student.id,
      status: 'ACTIVE',
      enrolledAt: new Date('2026-01-02T00:00:00.000Z'),
      contentVersion: 7,
    };
    enrollmentRepository.findAndCount.mockResolvedValue([[row], 1]);
    const list = await request(app.getHttpServer())
      .get('/api/v1/enrollments/me')
      .set('x-mock-user', 'studentA')
      .expect(200);
    expect(list.body.data).toMatchObject({
      total: 1,
      items: [{ enrollment: { enrollmentId, contentVersion: 7 } }],
    });

    enrollmentRepository.findOneBy.mockResolvedValue(row);
    const check = await request(app.getHttpServer())
      .get('/api/v1/internal/enrollments/check')
      .query({ userId: student.id, courseId })
      .expect(200);
    expect(check.body.data).toEqual({
      enrolled: true,
      enrollmentId,
      status: 'ACTIVE',
    });
  });

  it('cancels only the owner enrollment', async () => {
    enrollmentRepository.findOneBy.mockResolvedValue({
      id: enrollmentId,
      courseId,
      userId: student.id,
      status: 'ACTIVE',
      enrolledAt: new Date(),
      contentVersion: 7,
    });
    await request(app.getHttpServer())
      .delete(`/api/v1/enrollments/${enrollmentId}`)
      .set('x-mock-user', 'studentA')
      .expect(204);
    expect(enrollmentRepository.update).toHaveBeenCalledWith(
      { id: enrollmentId, userId: student.id },
      { status: 'CANCELLED' },
    );
  });
});
