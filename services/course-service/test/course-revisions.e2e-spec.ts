import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { getMockUser } from '@lms/auth';
import { parseContract } from '@lms/contracts';
import { HttpExceptionFilter } from '../src/common/http-exception.filter';
import { requestContext } from '../src/common/request-context';
import { CourseRevisionsController } from '../src/modules/course-revisions/course-revisions.controller';
import { CourseRevisionsService } from '../src/modules/course-revisions/course-revisions.service';
import { CourseReview } from '../src/modules/course-revisions/entities/course-review.entity';
import { Course } from '../src/modules/courses/entities/course.entity';

describe('Course review endpoints (HTTP with repository test doubles)', () => {
  let app: INestApplication;
  const courseId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const reviewId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const instructor = getMockUser('instructorA');
  const admin = getMockUser('adminA');
  const courseRepository = {
    findOneBy: jest.fn(),
    findOneByOrFail: jest.fn(),
    findAndCount: jest.fn(),
    update: jest.fn(),
  };
  const reviewRepository = {
    create: jest.fn((value: unknown) => value),
    save: jest.fn(),
    findAndCount: jest.fn(),
  };

  const course = (status: string = 'DRAFT', version = 1) => ({
    id: courseId,
    instructorId: instructor.id,
    title: 'Course',
    description: 'Description',
    thumbnailUrl: null,
    status,
    version,
    contentVersion: 2,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  });

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.MOCK_AUTH = 'true';
    const module = await Test.createTestingModule({
      controllers: [CourseRevisionsController],
      providers: [
        CourseRevisionsService,
        { provide: getRepositoryToken(Course), useValue: courseRepository },
        {
          provide: getRepositoryToken(CourseReview),
          useValue: reviewRepository,
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
    courseRepository.findOneByOrFail.mockResolvedValue(course('IN_REVIEW', 2));
    courseRepository.findAndCount.mockResolvedValue([[course('IN_REVIEW')], 1]);
    courseRepository.update.mockResolvedValue({ affected: 1 });
    reviewRepository.findAndCount.mockResolvedValue([[], 0]);
    reviewRepository.save.mockImplementation(
      async (value: Record<string, unknown>) => ({
        ...value,
        id: reviewId,
        reviewedAt: new Date('2026-01-03T00:00:00.000Z'),
      }),
    );
  });

  afterAll(async () => app.close());

  it('moves an owned draft to IN_REVIEW', async () => {
    const result = await request(app.getHttpServer())
      .post(`/api/v1/courses/${courseId}/submit-review`)
      .set('x-mock-user', 'instructorA')
      .send({ expectedVersion: 1 })
      .expect(200);

    expect(result.body.data).toMatchObject({ status: 'IN_REVIEW', version: 2 });
    expect(courseRepository.update).toHaveBeenCalledWith(
      { id: courseId, instructorId: instructor.id, version: 1 },
      { status: 'IN_REVIEW', version: 2 },
    );
  });

  it('lets admin inspect the queue and approve the course', async () => {
    const queue = await request(app.getHttpServer())
      .get('/api/v1/admin/courses/review-queue')
      .set('x-mock-user', 'adminA')
      .expect(200);
    expect(queue.body.data).toMatchObject({
      total: 1,
      items: [{ id: courseId, status: 'IN_REVIEW' }],
    });

    courseRepository.findOneBy.mockResolvedValue(course('IN_REVIEW', 2));
    const result = await request(app.getHttpServer())
      .post(`/api/v1/admin/courses/${courseId}/review`)
      .set('x-mock-user', 'adminA')
      .send({ expectedVersion: 2, decision: 'APPROVE' })
      .expect(200);

    expect(result.body.data).toMatchObject({
      id: reviewId,
      courseId,
      decision: 'APPROVE',
      status: 'PUBLISHED',
      reviewedBy: admin.id,
      version: 3,
      rejectionReason: null,
    });
    parseContract('CourseReviewData', result.body.data);
  });

  it('rejects with a reason and exposes review history to the owner', async () => {
    courseRepository.findOneBy.mockResolvedValue(course('IN_REVIEW', 2));
    const result = await request(app.getHttpServer())
      .post(`/api/v1/admin/courses/${courseId}/review`)
      .set('x-mock-user', 'adminA')
      .send({
        expectedVersion: 2,
        decision: 'REJECT',
        reason: 'Thiếu nội dung lesson',
      })
      .expect(200);
    expect(result.body.data).toMatchObject({
      decision: 'REJECT',
      status: 'REJECTED',
      rejectionReason: 'Thiếu nội dung lesson',
    });

    const review = {
      id: reviewId,
      courseId,
      decision: 'REJECT',
      status: 'REJECTED',
      reviewedBy: admin.id,
      reviewedAt: new Date('2026-01-03T00:00:00.000Z'),
      rejectionReason: 'Thiếu nội dung lesson',
      version: 3,
    };
    reviewRepository.findAndCount.mockResolvedValue([[review], 1]);
    const history = await request(app.getHttpServer())
      .get(`/api/v1/courses/${courseId}/reviews`)
      .set('x-mock-user', 'instructorA')
      .expect(200);
    expect(history.body.data).toMatchObject({
      total: 1,
      items: [{ id: reviewId, decision: 'REJECT' }],
    });
  });

  it('rejects non-admin review and stale versions', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/courses/review-queue')
      .set('x-mock-user', 'instructorA')
      .expect(403);
    courseRepository.findOneBy.mockResolvedValue(course('IN_REVIEW', 2));
    await request(app.getHttpServer())
      .post(`/api/v1/admin/courses/${courseId}/review`)
      .set('x-mock-user', 'adminA')
      .send({ expectedVersion: 1, decision: 'APPROVE' })
      .expect(409);
  });
});
