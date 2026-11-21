import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { getMockUser } from '@lms/auth';
import { parseContract } from '@lms/contracts';
import { In } from 'typeorm';
import { HttpExceptionFilter } from '../src/common/http-exception.filter';
import { requestContext } from '../src/common/request-context';
import { EnrollmentsController } from '../src/modules/enrollments/enrollments.controller';
import { EnrollmentsService } from '../src/modules/enrollments/enrollments.service';
import { Enrollment } from '../src/modules/enrollments/entities/enrollment.entity';
import { Course } from '../src/modules/courses/entities/course.entity';
import { InternalController } from '../src/modules/internal/internal.controller';
import { InternalService } from '../src/modules/internal/internal.service';
import { EnrollmentOutboxService } from '../src/modules/outbox/enrollment-outbox.service';
import { EnrollmentOutboxEvent } from '../src/modules/outbox/enrollment-outbox.entity';

describe('Enrollment endpoints (HTTP with repository test doubles)', () => {
  let app: INestApplication;
  const COURSE_INTERNAL_TOKEN = 'course-enrollment-internal-test';
  const originalServiceToken = process.env.COURSE_SERVICE_TOKEN;
  const courseId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const enrollmentId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const student = getMockUser('studentA');
  const courseRepository = { findOneBy: jest.fn(), findBy: jest.fn() };
  const enrollmentRepository = {
    manager: { transaction: jest.fn() },
    findOne: jest.fn(),
    findOneBy: jest.fn(),
    findAndCount: jest.fn(),
    create: jest.fn((value: unknown) => value),
    save: jest.fn(),
    update: jest.fn(),
  };
  const transactionManager = {
    queryRunner: { isTransactionActive: true },
    getRepository: (entity: unknown) =>
      entity === Course ? courseRepository : enrollmentRepository,
    insert: jest.fn(),
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
    process.env.COURSE_SERVICE_TOKEN = COURSE_INTERNAL_TOKEN;
    const module = await Test.createTestingModule({
      controllers: [EnrollmentsController, InternalController],
      providers: [
        EnrollmentsService,
        EnrollmentOutboxService,
        {
          provide: getRepositoryToken(Enrollment),
          useValue: enrollmentRepository,
        },
        { provide: getRepositoryToken(Course), useValue: courseRepository },
        {
          provide: InternalService,
          useValue: { checkCourseAccess: jest.fn() },
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
    enrollmentRepository.manager.transaction.mockImplementation(async (work) =>
      work(transactionManager),
    );
    enrollmentRepository.findOne.mockImplementation(async ({ where }) =>
      enrollmentRepository.findOneBy(where),
    );
    transactionManager.insert.mockResolvedValue({});
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

  afterAll(async () => {
    if (originalServiceToken === undefined)
      delete process.env.COURSE_SERVICE_TOKEN;
    else process.env.COURSE_SERVICE_TOKEN = originalServiceToken;
    await app.close();
  });

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
    expect(transactionManager.insert).toHaveBeenCalledWith(
      EnrollmentOutboxEvent,
      expect.objectContaining({
        routingKey: 'course.enrollment.created.v2',
        event: expect.objectContaining({ payload: result.body.data }),
      }),
    );
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

  it('creates a new enrollment after cancellation without overwriting history', async () => {
    const cancelled = {
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      courseId,
      userId: student.id,
      status: 'CANCELLED',
      enrolledAt: new Date('2026-01-01T00:00:00.000Z'),
      contentVersion: 3,
    };
    enrollmentRepository.findOneBy.mockImplementation(async (where) => {
      expect(where).toEqual({
        courseId,
        userId: student.id,
        status: In(['ACTIVE', 'COMPLETED']),
      });
      return null;
    });
    const result = await request(app.getHttpServer())
      .post(`/api/v1/courses/${courseId}/enrollments`)
      .set('x-mock-user', 'studentA')
      .expect(201);
    expect(result.body.data.enrollmentId).not.toBe(cancelled.id);
    expect(enrollmentRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ACTIVE', contentVersion: 7 }),
    );
    expect(enrollmentRepository.save.mock.calls[0][0]).not.toHaveProperty('id');
    expect(enrollmentRepository.update).not.toHaveBeenCalled();
    expect(cancelled.status).toBe('CANCELLED');
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
      .set('Authorization', `Bearer ${COURSE_INTERNAL_TOKEN}`)
      .query({ userId: student.id, courseId })
      .expect(200);
    expect(check.body.data).toEqual({
      enrolled: true,
      enrollmentId,
      status: 'ACTIVE',
    });
    expect(enrollmentRepository.findOneBy).toHaveBeenLastCalledWith({
      userId: student.id,
      courseId,
      status: In(['ACTIVE', 'COMPLETED']),
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
    expect(enrollmentRepository.findOne).toHaveBeenCalledWith({
      where: { id: enrollmentId },
      lock: { mode: 'pessimistic_write' },
    });
    expect(transactionManager.insert).toHaveBeenCalledWith(
      EnrollmentOutboxEvent,
      expect.objectContaining({
        routingKey: 'course.enrollment.cancelled.v1',
        event: expect.objectContaining({
          payload: expect.objectContaining({
            enrollmentId,
            courseId,
            userId: student.id,
          }),
        }),
      }),
    );
  });

  it('does not emit a second cancellation event for a cancelled enrollment', async () => {
    enrollmentRepository.findOneBy.mockResolvedValue({
      id: enrollmentId,
      courseId,
      userId: student.id,
      status: 'CANCELLED',
    });
    await request(app.getHttpServer())
      .delete(`/api/v1/enrollments/${enrollmentId}`)
      .set('x-mock-user', 'studentA')
      .expect(204);
    expect(transactionManager.insert).not.toHaveBeenCalled();
    expect(enrollmentRepository.update).not.toHaveBeenCalled();
  });

  it('rejects the create transaction when durable event insertion fails', async () => {
    transactionManager.insert.mockRejectedValueOnce(
      new Error('outbox unavailable'),
    );
    await request(app.getHttpServer())
      .post(`/api/v1/courses/${courseId}/enrollments`)
      .set('x-mock-user', 'studentA')
      .expect(500);
    expect(enrollmentRepository.manager.transaction).toHaveBeenCalledTimes(1);
  });
});
