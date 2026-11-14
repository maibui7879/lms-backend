import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { getMockUser } from '@lms/auth';
import { parseContract } from '@lms/contracts';
import { HttpExceptionFilter } from '../src/common/http-exception.filter';
import { requestContext } from '../src/common/request-context';
import { CompletionPolicyController } from '../src/modules/completion-policy/completion-policy.controller';
import { CompletionPolicyService } from '../src/modules/completion-policy/completion-policy.service';
import { CompletionPolicy } from '../src/modules/completion-policy/entities/completion-policy.entity';
import { Chapter } from '../src/modules/chapters/entities/chapter.entity';
import { Course } from '../src/modules/courses/entities/course.entity';
import { LearningItem } from '../src/modules/learning-items/entities/learning-item.entity';
import { Lesson } from '../src/modules/lessons/entities/lesson.entity';
import { CourseRevision } from '../src/modules/course-revisions/entities/course-revision.entity';

describe('Completion policy endpoints', () => {
  let app: INestApplication;
  const courseId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const chapterId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const lessonId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const itemId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const owner = getMockUser('instructorA');
  const courseRepository = { findOneBy: jest.fn(), update: jest.fn() };
  const revisionRepository = { findOneBy: jest.fn() };
  const policyRepository = {
    findOneBy: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn((value: unknown) => value),
    save: jest.fn(),
  };
  const itemRepository = { find: jest.fn() };
  const chapterRepository = { find: jest.fn() };
  const lessonRepository = { find: jest.fn() };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.MOCK_AUTH = 'true';
    const module = await Test.createTestingModule({
      controllers: [CompletionPolicyController],
      providers: [
        CompletionPolicyService,
        {
          provide: getRepositoryToken(CompletionPolicy),
          useValue: policyRepository,
        },
        { provide: getRepositoryToken(Course), useValue: courseRepository },
        {
          provide: getRepositoryToken(CourseRevision),
          useValue: revisionRepository,
        },
        { provide: getRepositoryToken(Chapter), useValue: chapterRepository },
        { provide: getRepositoryToken(Lesson), useValue: lessonRepository },
        { provide: getRepositoryToken(LearningItem), useValue: itemRepository },
      ],
    }).compile();
    app = module.createNestApplication();
    app.use(requestContext);
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    courseRepository.findOneBy.mockResolvedValue({
      id: courseId,
      instructorId: owner.id,
      status: 'DRAFT',
      version: 1,
      contentVersion: 1,
    });
    courseRepository.update.mockResolvedValue({ affected: 1 });
    policyRepository.findOneBy.mockResolvedValue(null);
    policyRepository.findOne.mockResolvedValue(null);
    policyRepository.save.mockImplementation(async (value: unknown) => value);
    itemRepository.find.mockResolvedValue([
      {
        id: itemId,
        courseId,
        lessonId,
        type: 'READING',
        required: true,
        order: 1,
      },
    ]);
    chapterRepository.find.mockResolvedValue([
      { id: chapterId, courseId, title: 'Chapter', order: 1, version: 1 },
    ]);
    lessonRepository.find.mockResolvedValue([
      {
        id: lessonId,
        courseId,
        chapterId,
        title: 'Lesson',
        order: 1,
        version: 1,
      },
    ]);
  });

  afterAll(async () => app?.close());

  it('returns the default policy and computes requiredItemIds from learning items', async () => {
    const result = await request(app.getHttpServer())
      .get(`/api/v1/courses/${courseId}/completion-policy`)
      .set('x-mock-user', 'instructorA')
      .expect(200);
    expect(result.body.data).toMatchObject({
      courseId,
      contentVersion: 1,
      requiredItemIds: [itemId],
      chapterPolicies: [
        { chapterId, requiredItemIds: [itemId], requiredAssessments: [] },
      ],
      sequence: 'FREE',
      certificateEnabled: false,
    });
    parseContract('CourseCompletionPolicy', result.body.data);
  });

  it('updates the policy and bumps course version/contentVersion', async () => {
    const result = await request(app.getHttpServer())
      .put(`/api/v1/courses/${courseId}/completion-policy`)
      .set('x-mock-user', 'instructorA')
      .send({
        sequence: 'SEQUENTIAL',
        certificateEnabled: true,
        requiredAssessments: [],
        chapterPolicies: [
          { chapterId, requiredItemIds: [], requiredAssessments: [] },
        ],
        expectedVersion: 1,
      })
      .expect(200);
    expect(result.body.data).toMatchObject({
      courseId,
      contentVersion: 2,
      requiredItemIds: [itemId],
      sequence: 'SEQUENTIAL',
      certificateEnabled: true,
    });
    expect(courseRepository.update).toHaveBeenCalledWith(
      { id: courseId, version: 1 },
      { version: 2, contentVersion: 2 },
    );
  });

  it('rejects stale versions, invalid payloads, non-owners and published courses', async () => {
    await request(app.getHttpServer())
      .put(`/api/v1/courses/${courseId}/completion-policy`)
      .set('x-mock-user', 'instructorA')
      .send({
        sequence: 'FREE',
        certificateEnabled: false,
        requiredAssessments: [],
        chapterPolicies: [],
        expectedVersion: 2,
      })
      .expect(409);
    await request(app.getHttpServer())
      .put(`/api/v1/courses/${courseId}/completion-policy`)
      .set('x-mock-user', 'studentA')
      .send({
        sequence: 'FREE',
        certificateEnabled: false,
        requiredAssessments: [],
        chapterPolicies: [],
        expectedVersion: 1,
      })
      .expect(403);
    await request(app.getHttpServer())
      .put(`/api/v1/courses/${courseId}/completion-policy`)
      .set('x-mock-user', 'instructorA')
      .send({
        sequence: 'INVALID',
        certificateEnabled: false,
        requiredAssessments: [],
        chapterPolicies: [],
        expectedVersion: 1,
      })
      .expect(400);
    courseRepository.findOneBy.mockResolvedValue({
      id: courseId,
      instructorId: owner.id,
      status: 'PUBLISHED',
      version: 1,
      contentVersion: 1,
    });
    await request(app.getHttpServer())
      .put(`/api/v1/courses/${courseId}/completion-policy`)
      .set('x-mock-user', 'instructorA')
      .send({
        sequence: 'FREE',
        certificateEnabled: false,
        requiredAssessments: [],
        chapterPolicies: [],
        expectedVersion: 1,
      })
      .expect(409);
  });
});
