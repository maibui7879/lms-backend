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
import { CourseRevision } from '../src/modules/course-revisions/entities/course-revision.entity';
import { Chapter } from '../src/modules/chapters/entities/chapter.entity';
import { Lesson } from '../src/modules/lessons/entities/lesson.entity';
import { LearningItem } from '../src/modules/learning-items/entities/learning-item.entity';
import { DataSource } from 'typeorm';
import { EnrollmentOutboxEvent } from '../src/modules/outbox/enrollment-outbox.entity';
import { COURSE_REVIEW_NOTIFICATION_ROUTING_KEY } from '@lms/contracts';

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
  const revisionRepository = {
    findOneBy: jest.fn(),
    findOne: jest.fn(),
    findOneByOrFail: jest.fn(),
    findAndCount: jest.fn(),
    update: jest.fn(),
  };
  const chapterRepository = { find: jest.fn() };
  const lessonRepository = { find: jest.fn() };
  const itemRepository = { find: jest.fn() };
  const transactionManager = {
    update: jest.fn(),
    create: jest.fn((_entity: unknown, value: unknown) => value),
    save: jest.fn(async (entity: unknown, value: Record<string, unknown>) =>
      entity === CourseReview ? reviewRepository.save(value) : value,
    ),
  };
  const dataSource = {
    transaction: jest.fn(
      async (callback: (manager: typeof transactionManager) => unknown) =>
        callback(transactionManager),
    ),
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
        {
          provide: getRepositoryToken(CourseRevision),
          useValue: revisionRepository,
        },
        { provide: getRepositoryToken(Chapter), useValue: chapterRepository },
        { provide: getRepositoryToken(Lesson), useValue: lessonRepository },
        {
          provide: getRepositoryToken(LearningItem),
          useValue: itemRepository,
        },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();
    app = module.createNestApplication();
    app.use(requestContext);
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  it.each(['DRAFT', 'REJECTED', 'IN_REVIEW', 'PUBLISHED'])(
    'reads revision-specific outline in status %s without exposing another snapshot',
    async (status) => {
      const revisionId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
      const chapterId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
      const lessonId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
      courseRepository.findOneBy.mockResolvedValue(course('PUBLISHED'));
      revisionRepository.findOneBy.mockResolvedValue({
        id: revisionId,
        courseId,
        baseContentVersion: 2,
        contentVersion: status === 'PUBLISHED' ? 3 : null,
        status,
        createdBy: instructor.id,
        createdAt: new Date(),
        submittedAt: null,
        publishedAt: null,
        version: 4,
        updateType: 'NORMAL',
        migrationPolicy: 'KEEP_ENROLLED_VERSION',
      });
      chapterRepository.find.mockResolvedValue([
        {
          id: chapterId,
          courseId,
          revisionId,
          title: 'Revised chapter',
          order: 1,
          version: 2,
          endSectionQuiz: null,
        },
      ]);
      lessonRepository.find.mockResolvedValue([
        {
          id: lessonId,
          courseId,
          revisionId,
          chapterId,
          title: 'Revised lesson',
          order: 1,
          version: 3,
        },
      ]);
      itemRepository.find.mockResolvedValue([
        {
          id: reviewId,
          courseId,
          revisionId,
          lessonId,
          title: 'Revised text',
          type: 'READING',
          body: 'Revision only',
          required: true,
          order: 1,
          version: 4,
          contentVersion: 2,
        },
      ]);
      const path = `/api/v1/course-revisions/${revisionId}/outline`;
      for (const caller of ['instructorA', 'adminA']) {
        const result = await request(app.getHttpServer())
          .get(path)
          .set('x-mock-user', caller)
          .expect(200);
        parseContract('CourseOutlineData', result.body.data);
        expect(result.body.data.revisionId).toBe(revisionId);
        expect(result.body.data.contentVersion).toBe(
          status === 'PUBLISHED' ? 3 : 2,
        );
        expect(result.body.data.chapters[0].lessons[0].items[0].body).toBe(
          'Revision only',
        );
        expect(chapterRepository.find).toHaveBeenCalledWith(
          expect.objectContaining({ where: { courseId, revisionId } }),
        );
      }
      await request(app.getHttpServer())
        .get(path)
        .set('x-mock-user', 'instructorB')
        .expect(403);
      await request(app.getHttpServer())
        .get(path)
        .set('x-mock-user', 'studentA')
        .expect(403);
      await request(app.getHttpServer()).get(path).expect(401);
      revisionRepository.findOneBy.mockResolvedValue(null);
      await request(app.getHttpServer())
        .get(path)
        .set('x-mock-user', 'instructorA')
        .expect(404);
      await request(app.getHttpServer())
        .get('/api/v1/course-revisions/not-uuid/outline')
        .set('x-mock-user', 'instructorA')
        .expect(400);
    },
  );

  beforeEach(() => {
    jest.clearAllMocks();
    transactionManager.update.mockImplementation(
      async (
        _entity: unknown,
        criteria: unknown,
        changes: Record<string, unknown>,
      ) => courseRepository.update(criteria, changes),
    );
    courseRepository.findOneBy.mockResolvedValue(course());
    courseRepository.findOneByOrFail.mockResolvedValue(course('IN_REVIEW', 2));
    courseRepository.findAndCount.mockResolvedValue([[course('IN_REVIEW')], 1]);
    courseRepository.update.mockResolvedValue({ affected: 1 });
    reviewRepository.findAndCount.mockResolvedValue([[], 0]);
    chapterRepository.find.mockResolvedValue([]);
    lessonRepository.find.mockResolvedValue([]);
    itemRepository.find.mockResolvedValue([]);
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
    expect(transactionManager.save).toHaveBeenCalledWith(
      EnrollmentOutboxEvent,
      expect.objectContaining({
        routingKey: COURSE_REVIEW_NOTIFICATION_ROUTING_KEY,
        sentAt: null,
        event: expect.objectContaining({
          eventType: 'course.review.decided',
          version: 1,
          producer: 'course-service',
          payload: {
            recipientId: instructor.id,
            courseId,
            revisionId: null,
            decision: 'APPROVE',
            reason: null,
            version: 3,
          },
        }),
      }),
    );
    expect(courseRepository.update).toHaveBeenCalledWith(
      { id: courseId, version: 2, status: 'IN_REVIEW' },
      { status: 'PUBLISHED', version: 3, initialPublishedContentVersion: 2 },
    );
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

  it('notifies the course owner when rejecting a revision', async () => {
    const revisionId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    revisionRepository.findOneBy.mockResolvedValue({
      id: revisionId,
      courseId,
      version: 4,
      status: 'IN_REVIEW',
      baseContentVersion: 2,
    });
    const service = app.get(CourseRevisionsService);
    revisionRepository.findOneByOrFail.mockResolvedValue({
      id: revisionId,
      courseId,
      version: 5,
      status: 'REJECTED',
      baseContentVersion: 2,
      contentVersion: null,
      createdAt: new Date(),
      submittedAt: null,
      publishedAt: null,
    });
    await expect(
      service.reviewRevision(
        revisionId,
        {
          expectedVersion: 4,
          decision: 'REJECT',
          reason: 'Needs changes',
        },
        admin,
      ),
    ).resolves.toMatchObject({ status: 'REJECTED', version: 5 });
    expect(transactionManager.save).toHaveBeenCalledWith(
      EnrollmentOutboxEvent,
      expect.objectContaining({
        routingKey: COURSE_REVIEW_NOTIFICATION_ROUTING_KEY,
        event: expect.objectContaining({
          payload: {
            recipientId: instructor.id,
            courseId,
            revisionId,
            decision: 'REJECT',
            reason: 'Needs changes',
            version: 5,
          },
        }),
      }),
    );
  });

  it('does not persist a notice when the optimistic update conflicts', async () => {
    courseRepository.findOneBy.mockResolvedValue(course('IN_REVIEW', 2));
    courseRepository.update.mockResolvedValueOnce({ affected: 0 });
    await request(app.getHttpServer())
      .post(`/api/v1/admin/courses/${courseId}/review`)
      .set('x-mock-user', 'adminA')
      .send({ expectedVersion: 2, decision: 'APPROVE' })
      .expect(409);
    expect(transactionManager.save).not.toHaveBeenCalled();
  });

  it('fails the review transaction if the notice cannot be persisted', async () => {
    courseRepository.findOneBy.mockResolvedValue(course('IN_REVIEW', 2));
    transactionManager.save
      .mockImplementationOnce(async (_entity, value) =>
        reviewRepository.save(value),
      )
      .mockRejectedValueOnce(new Error('Notification persistence failed'));
    await expect(
      app
        .get(CourseRevisionsService)
        .review(courseId, { expectedVersion: 2, decision: 'APPROVE' }, admin),
    ).rejects.toThrow('Notification persistence failed');
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
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
