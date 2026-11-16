import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { parseContract } from '@lms/contracts';
import { HttpExceptionFilter } from '../src/common/http-exception.filter';
import { requestContext } from '../src/common/request-context';
import { CoursesModule } from '../src/modules/courses/courses.module';
import { Course } from '../src/modules/courses/entities/course.entity';
import { Chapter } from '../src/modules/chapters/entities/chapter.entity';
import { Lesson } from '../src/modules/lessons/entities/lesson.entity';
import { LearningItem } from '../src/modules/learning-items/entities/learning-item.entity';
import { Enrollment } from '../src/modules/enrollments/entities/enrollment.entity';
import { CourseRevisionsController } from '../src/modules/course-revisions/course-revisions.controller';
import { CourseRevisionsService } from '../src/modules/course-revisions/course-revisions.service';
import { CourseReview } from '../src/modules/course-revisions/entities/course-review.entity';
import { CourseRevision } from '../src/modules/course-revisions/entities/course-revision.entity';
import { EnrollmentsModule } from '../src/modules/enrollments/enrollments.module';
import { DataSource } from 'typeorm';

describe('Course creation to enrollment workflow', () => {
  let app: INestApplication;
  const courseId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const enrollmentId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const reviewId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const state = {
    course: {
      id: courseId,
      instructorId: '22222222-2222-4222-8222-222222222222',
      title: 'Workflow course',
      description: 'End-to-end workflow',
      thumbnailUrl: null,
      status: 'DRAFT',
      version: 1,
      contentVersion: 1,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    },
  };
  const courseRepository = {
    create: jest.fn((value: unknown) => value),
    save: jest.fn(),
    findOneBy: jest.fn(),
    findOneByOrFail: jest.fn(),
    findAndCount: jest.fn(),
    update: jest.fn(),
  };
  const chapterRepository = { find: jest.fn() };
  const lessonRepository = { find: jest.fn() };
  const itemRepository = { find: jest.fn() };
  const enrollmentRepository = {
    findOneBy: jest.fn(),
    findAndCount: jest.fn(),
    create: jest.fn((value: unknown) => value),
    save: jest.fn(),
    update: jest.fn(),
  };
  const reviewRepository = {
    create: jest.fn((value: unknown) => value),
    save: jest.fn(),
    findAndCount: jest.fn(),
  };
  const revisionRepository = {};
  const transactionManager = { update: jest.fn() };
  const dataSource = {
    transaction: jest.fn(
      async (callback: (manager: typeof transactionManager) => unknown) =>
        callback(transactionManager),
    ),
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.MOCK_AUTH = 'true';
    const module = await Test.createTestingModule({
      imports: [CoursesModule, EnrollmentsModule],
      controllers: [CourseRevisionsController],
      providers: [
        CourseRevisionsService,
        { provide: DataSource, useValue: dataSource },
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
        { provide: getRepositoryToken(LearningItem), useValue: itemRepository },
      ],
    })
      .overrideProvider(getRepositoryToken(Course))
      .useValue(courseRepository)
      .overrideProvider(getRepositoryToken(Chapter))
      .useValue(chapterRepository)
      .overrideProvider(getRepositoryToken(Lesson))
      .useValue(lessonRepository)
      .overrideProvider(getRepositoryToken(LearningItem))
      .useValue(itemRepository)
      .overrideProvider(getRepositoryToken(Enrollment))
      .useValue(enrollmentRepository)
      .overrideProvider(getRepositoryToken(CourseReview))
      .useValue(reviewRepository)
      .overrideProvider(getRepositoryToken(CourseRevision))
      .useValue(revisionRepository)
      .overrideProvider(DataSource)
      .useValue(dataSource)
      .compile();
    app = module.createNestApplication();
    app.use(requestContext);
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    Object.assign(state.course, {
      status: 'DRAFT',
      version: 1,
      contentVersion: 1,
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    courseRepository.save.mockImplementation(
      async (value: Record<string, unknown>) => ({
        ...value,
        id: courseId,
        createdAt: state.course.createdAt,
        updatedAt: state.course.updatedAt,
      }),
    );
    courseRepository.findOneBy.mockImplementation(async () => state.course);
    courseRepository.findOneByOrFail.mockImplementation(
      async () => state.course,
    );
    courseRepository.findAndCount.mockImplementation(async () => [
      [state.course],
      1,
    ]);
    courseRepository.update.mockImplementation(
      async (_criteria: unknown, changes: Record<string, unknown>) => {
        Object.assign(state.course, changes, { updatedAt: new Date() });
        return { affected: 1 };
      },
    );
    chapterRepository.find.mockResolvedValue([]);
    lessonRepository.find.mockResolvedValue([]);
    itemRepository.find.mockResolvedValue([]);
    enrollmentRepository.findOneBy.mockResolvedValue(null);
    enrollmentRepository.save.mockImplementation(
      async (value: Record<string, unknown>) => ({
        ...value,
        id: enrollmentId,
        enrolledAt: value.enrolledAt ?? new Date('2026-01-04T00:00:00.000Z'),
      }),
    );
    reviewRepository.save.mockImplementation(
      async (value: Record<string, unknown>) => ({
        ...value,
        id: reviewId,
        reviewedAt: new Date('2026-01-03T00:00:00.000Z'),
      }),
    );
  });

  afterAll(async () => app.close());

  it('creates, submits, approves, then enrolls a student', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/courses')
      .set('x-mock-user', 'instructorA')
      .send({ title: 'Workflow course', description: 'End-to-end workflow' })
      .expect(201);
    expect(created.body.data).toMatchObject({ status: 'DRAFT', version: 1 });
    parseContract('CourseData', created.body.data);

    const submitted = await request(app.getHttpServer())
      .post(`/api/v1/courses/${courseId}/submit-review`)
      .set('x-mock-user', 'instructorA')
      .send({ expectedVersion: 1 })
      .expect(200);
    expect(submitted.body.data).toMatchObject({
      status: 'IN_REVIEW',
      version: 2,
    });

    const queue = await request(app.getHttpServer())
      .get('/api/v1/admin/courses/review-queue')
      .set('x-mock-user', 'adminA')
      .expect(200);
    expect(queue.body.data.items[0]).toMatchObject({
      id: courseId,
      status: 'IN_REVIEW',
    });

    const reviewed = await request(app.getHttpServer())
      .post(`/api/v1/admin/courses/${courseId}/review`)
      .set('x-mock-user', 'adminA')
      .send({ expectedVersion: 2, decision: 'APPROVE' })
      .expect(200);
    expect(reviewed.body.data).toMatchObject({
      id: reviewId,
      courseId,
      decision: 'APPROVE',
      status: 'PUBLISHED',
    });

    const enrolled = await request(app.getHttpServer())
      .post(`/api/v1/courses/${courseId}/enrollments`)
      .set('x-mock-user', 'studentA')
      .expect(201);
    expect(enrolled.body.data).toMatchObject({
      enrollmentId,
      courseId,
      userId: '11111111-1111-4111-8111-111111111111',
      status: 'ACTIVE',
      contentVersion: 1,
    });
    parseContract('EnrollmentSnapshotData', enrolled.body.data);
  });
});
