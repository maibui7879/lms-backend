import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { parseContract } from '@lms/contracts';
import type { AttemptAccessData, AttemptGradedV2Event } from '@lms/contracts';
import { connect } from 'amqplib';
import type {
  ChannelModel,
  ConfirmChannel,
  ConsumeMessage,
  RecoveryOptions,
} from 'amqplib';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { CourseClient } from '../src/integrations/course.client';
import type { AssessmentAttempt } from '../src/modules/progress-sync/entities/assessment-attempt.entity';
import type { AssessmentSyncReceipt } from '../src/modules/progress-sync/entities/assessment-sync-receipt.entity';
import { AssessmentAttemptsRepository } from '../src/modules/progress-sync/repositories/assessment-attempts.repository';
import type { ItemCompletion } from '../src/modules/progress/entities/item-completion.entity';
import { ItemCompletionsRepository } from '../src/modules/progress/repositories/item-completions.repository';
import providers from './fixtures/learning-providers.mock.json';
import scenarios from './fixtures/learning-scenarios.mock.json';

jest.mock('amqplib');
jest.mock('node:timers/promises', () => ({
  ...jest.requireActual<typeof import('node:timers/promises')>(
    'node:timers/promises',
  ),
  setTimeout: jest.fn().mockResolvedValue(undefined),
}));

const enrollment = parseContract(
  'EnrollmentSnapshotData',
  providers.course.enrollment,
);
const original = parseContract(
  'CourseLearningStructure',
  providers.course.structure,
);
const { initial, videoCompleted } = scenarios.expected;
const [chapterOne, chapterTwo] = original.outline.chapters;
const [video, optional, quiz] = chapterOne.lessons[0].items;
const reading = chapterTwo.lessons[0].items[0];
const chapterAttempt79 = parseContract(
  'AttemptGradedV2Event',
  providers.quiz.chapterAttempt79,
);
const chapterAttempt80 = parseContract(
  'AttemptGradedV2Event',
  providers.quiz.chapterAttempt80,
);
const courseAttempt = parseContract(
  'AttemptGradedV2Event',
  providers.quiz.attemptGraded,
);
const attemptAccess = parseContract(
  'AttemptAccessData',
  providers.quiz.attemptAccess,
);
const syncPath = `/api/v1/learning/attempts/${attemptAccess.attemptId}/sync`;
const progressPath = `/api/v1/learning/courses/${enrollment.courseId}/progress`;
const chapterAccessPath = `/api/v1/learning/courses/${enrollment.courseId}/chapters/access`;
const itemPath = (id: string) => `/api/v1/learning/items/${id}/completion`;

describe('Learning progress (e2e)', () => {
  let app: INestApplication<App>;
  let previousMockAuth: string | undefined;
  let previousRabbitUrl: string | undefined;
  let previousQuizToken: string | undefined;
  let previousQuizUrl: string | undefined;
  let structure = structuredClone(original);
  const records: ItemCompletion[] = [];
  const attempts: AssessmentAttempt[] = [];
  const receipts = new Map<string, AssessmentSyncReceipt>();
  const storedAt = new Date('2026-01-15T09:10:05Z');
  const findReceipt = jest.fn(async (access: AttemptAccessData) => {
    await Promise.resolve();
    const receipt = receipts.get(access.eventId ?? '');
    return receipt?.attemptId === access.attemptId &&
      receipt.userId === access.userId &&
      receipt.courseId === access.courseId
      ? receipt
      : null;
  });

  function saveReceipt(
    { eventId, payload }: AttemptGradedV2Event,
    status: AssessmentSyncReceipt['status'],
  ) {
    if (receipts.get(eventId)?.status === 'SYNCED') return;
    const { attemptId, assessmentVersion, userId, courseId } = payload;
    receipts.set(eventId, {
      eventId,
      attemptId,
      assessmentVersion,
      userId,
      courseId,
      status,
      updatedAt: storedAt,
    });
  }
  let receive: (message: ConsumeMessage) => void;
  let acknowledge: () => void;
  const forwardToDlq = jest.fn(
    (
      _queue: string,
      _body: Buffer,
      _options: unknown,
      confirmed: (error: null) => void,
    ) => {
      confirmed(null);
      return true;
    },
  );
  const record = jest.fn(
    async (event: AttemptGradedV2Event): Promise<'SYNCED' | 'CONFLICT'> => {
      const { eventId, payload } = event;
      await Promise.resolve();
      if (
        attempts.some(
          (attempt) =>
            attempt.eventId === eventId ||
            (attempt.attemptId === payload.attemptId &&
              attempt.assessmentVersion === payload.assessmentVersion),
        )
      )
        return 'SYNCED';
      attempts.push({
        attemptId: payload.attemptId,
        assessmentVersion: payload.assessmentVersion,
        userId: payload.userId,
        courseId: payload.courseId,
        gradedAt: new Date(payload.gradedAt),
        eventId,
        result: payload,
      });
      saveReceipt(event, 'SYNCED');
      return 'SYNCED';
    },
  );
  const complete = jest.fn(
    async (
      enrollmentId: string,
      contentVersion: number,
      learningItemId: string,
    ) => {
      const existing = records.find(
        (row) =>
          row.enrollmentId === enrollmentId &&
          row.contentVersion === contentVersion &&
          row.learningItemId === learningItemId,
      );
      if (existing) return existing;
      const row = {
        enrollmentId,
        contentVersion,
        learningItemId,
        completedAt: new Date(videoCompleted.completedAt),
      };
      records.push(row);
      return row;
    },
  );

  beforeAll(async () => {
    previousMockAuth = process.env.MOCK_AUTH;
    previousRabbitUrl = process.env.RABBITMQ_URL;
    previousQuizToken = process.env.QUIZ_SERVICE_TOKEN;
    previousQuizUrl = process.env.QUIZ_URL;
    process.env.MOCK_AUTH = 'true';
    process.env.RABBITMQ_URL = 'amqp://fixture.test';
    process.env.QUIZ_SERVICE_TOKEN = 'fixture-service-token';
    process.env.QUIZ_URL = 'http://quiz.fixture.test';
    const channel = {
      on: jest.fn(),
      off: jest.fn(),
      assertExchange: jest.fn(),
      assertQueue: jest.fn(),
      bindQueue: jest.fn(),
      prefetch: jest.fn(),
      consume: jest.fn(
        (_queue: string, callback: (message: ConsumeMessage) => void) => {
          receive = callback;
        },
      ),
      ack: () => acknowledge(),
      sendToQueue: forwardToDlq,
    } as unknown as ConfirmChannel;
    const connection = {
      on: jest.fn(),
      createConfirmChannel: () => Promise.resolve(channel),
      close: () => Promise.resolve(),
    };
    jest.mocked(connect).mockImplementation(async (_url, options) => {
      const { setup } = (options as { recovery: RecoveryOptions }).recovery;
      await (setup as (model: ChannelModel) => Promise<void>)(
        connection as unknown as ChannelModel,
      );
      return connection as unknown as ChannelModel;
    });
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CourseClient)
      .useValue({
        async *enrollments({ userId }: { userId: string }) {
          await Promise.resolve();
          if (userId === enrollment.userId) yield enrollment;
        },
        structure: () => Promise.resolve(structure),
      })
      .overrideProvider(ItemCompletionsRepository)
      .useValue({
        list: (enrollmentId: string, contentVersion: number) =>
          Promise.resolve(
            records.filter(
              (row) =>
                row.enrollmentId === enrollmentId &&
                row.contentVersion === contentVersion,
            ),
          ),
        complete,
      })
      .overrideProvider(AssessmentAttemptsRepository)
      .useValue({
        record,
        findReceipt,
        markRetrying: (event: AttemptGradedV2Event) => {
          if (receipts.get(event.eventId)?.status === 'FAILED')
            saveReceipt(event, 'PENDING');
        },
        markFailed: (event: AttemptGradedV2Event) =>
          saveReceipt(event, 'FAILED'),
        list: ({ userId, courseId, enrolledAt }: typeof enrollment) =>
          Promise.resolve(
            attempts.filter(
              (attempt) =>
                attempt.userId === userId &&
                attempt.courseId === courseId &&
                attempt.gradedAt >= new Date(enrolledAt),
            ),
          ),
      })
      .compile();
    app = module.createNestApplication();
    await app.init();
  });

  beforeEach(() => {
    records.length = 0;
    attempts.length = 0;
    receipts.clear();
    complete.mockClear();
    record.mockClear();
    findReceipt.mockClear();
    forwardToDlq.mockClear();
    structure = structuredClone(original);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    if (previousMockAuth === undefined) delete process.env.MOCK_AUTH;
    else process.env.MOCK_AUTH = previousMockAuth;
    if (previousRabbitUrl === undefined) delete process.env.RABBITMQ_URL;
    else process.env.RABBITMQ_URL = previousRabbitUrl;
    if (previousQuizToken === undefined) delete process.env.QUIZ_SERVICE_TOKEN;
    else process.env.QUIZ_SERVICE_TOKEN = previousQuizToken;
    if (previousQuizUrl === undefined) delete process.env.QUIZ_URL;
    else process.env.QUIZ_URL = previousQuizUrl;
    await app?.close();
  });

  function put(id: string, body = scenarios.requests.completeItem) {
    return request(app.getHttpServer())
      .put(itemPath(id))
      .set('X-Mock-User', 'studentB')
      .send(body);
  }

  function getProgress() {
    return request(app.getHttpServer())
      .get(progressPath)
      .set('X-Mock-User', 'studentB');
  }

  async function getChapterAccess() {
    const result = await request(app.getHttpServer())
      .get(chapterAccessPath)
      .set('X-Mock-User', 'studentB')
      .expect(200);
    return parseContract('CourseChapterAccessData', result.body.data);
  }

  function deliver(event: AttemptGradedV2Event): Promise<void> {
    return new Promise((resolve) => {
      acknowledge = resolve;
      receive({
        content: Buffer.from(JSON.stringify(event)),
      } as ConsumeMessage);
    });
  }

  function getSync(user = 'studentB') {
    return request(app.getHttpServer())
      .get(syncPath)
      .set('X-Mock-User', user)
      .set('X-Request-Id', 'quiz-sync-e2e');
  }

  it('shows pending before delivery and synced only after recording the grade', async () => {
    const fetchQuiz = jest
      .spyOn(global, 'fetch')
      .mockImplementation(() =>
        Promise.resolve(Response.json({ data: attemptAccess })),
      );
    const pending = await getSync().expect(200);
    expect(parseContract('ProgressSyncData', pending.body.data)).toEqual({
      attemptId: attemptAccess.attemptId,
      eventId: attemptAccess.eventId,
      status: 'PENDING',
      updatedAt: null,
      error: null,
    });
    expect(fetchQuiz).toHaveBeenCalledWith(
      new URL(
        `/api/v1/internal/attempts/${attemptAccess.attemptId}/access`,
        'http://quiz.fixture.test',
      ),
      expect.objectContaining({
        headers: {
          Authorization: 'Bearer fixture-service-token',
          'X-Request-Id': 'quiz-sync-e2e',
        },
      }),
    );

    await deliver(courseAttempt);
    const synced = await getSync().expect(200);
    expect(parseContract('ProgressSyncData', synced.body.data)).toMatchObject({
      status: 'SYNCED',
      updatedAt: storedAt.toISOString(),
      error: null,
    });
    await deliver(courseAttempt);
    const duplicate = await getSync().expect(200);
    expect(duplicate.body.data).toEqual(synced.body.data);
  });

  it('checks attempt ownership and distinguishes Quiz errors from pending', async () => {
    const fetchQuiz = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(Response.json({ data: attemptAccess }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockRejectedValueOnce(new DOMException('Timeout', 'TimeoutError'))
      .mockResolvedValueOnce(new Response(null, { status: 504 }))
      .mockResolvedValueOnce(
        Response.json({
          data: {
            ...attemptAccess,
            attemptId: chapterAttempt80.payload.attemptId,
          },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ data: { ...attemptAccess, eventId: null } }),
      );

    const forbidden = await getSync('studentA').expect(403);
    expect(forbidden.body.error.code).toBe('NOT_ATTEMPT_OWNER');
    await getSync().expect(404);
    await getSync().expect(503);
    await getSync().expect(504);
    await getSync().expect(504);
    await getSync().expect(503);
    expect(findReceipt).not.toHaveBeenCalled();
    const pending = await getSync().expect(200);
    expect(pending.body.data).toMatchObject({
      status: 'PENDING',
      eventId: null,
    });
    expect(fetchQuiz).toHaveBeenCalledTimes(7);
  });

  it('shows a saved failure and accepts a replay of the original event', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockImplementation(() =>
        Promise.resolve(Response.json({ data: attemptAccess })),
      );
    const failure = new Error('Fixture storage error');
    record
      .mockRejectedValueOnce(failure)
      .mockRejectedValueOnce(failure)
      .mockRejectedValueOnce(failure)
      .mockRejectedValueOnce(failure);
    await deliver(courseAttempt);
    expect(record).toHaveBeenCalledTimes(4);
    expect(forwardToDlq).toHaveBeenCalledTimes(1);
    const failed = await getSync().expect(200);
    expect(parseContract('ProgressSyncData', failed.body.data)).toMatchObject({
      status: 'FAILED',
      error: { code: 'PROJECTION_FAILED' },
    });

    let resumeWrite!: () => void;
    const allowWrite = new Promise<void>((resolve) => {
      resumeWrite = resolve;
    });
    let startWrite!: () => void;
    const writing = new Promise<void>((resolve) => {
      startWrite = resolve;
    });
    const save = record.getMockImplementation()!;
    record.mockImplementationOnce(async (event) => {
      startWrite();
      await allowWrite;
      return save(event);
    });
    const replay = deliver(courseAttempt);
    try {
      await writing;
      const retrying = await getSync().expect(200);
      expect(retrying.body.data).toMatchObject({
        status: 'PENDING',
        eventId: courseAttempt.eventId,
        error: null,
      });
    } finally {
      resumeWrite();
      await replay;
    }
    const synced = await getSync().expect(200);
    expect(synced.body.data).toMatchObject({
      status: 'SYNCED',
      eventId: courseAttempt.eventId,
      error: null,
    });
  });

  it('starts at zero and counts the same required item only once', async () => {
    const zero = await getProgress().expect(200);
    expect(parseContract('CourseProgressData', zero.body.data)).toEqual({
      ...initial,
      updatedAt: new Date(initial.updatedAt).toISOString(),
    });
    const [first, retry] = await Promise.all([
      put(video.id).expect(200),
      put(video.id).expect(200),
    ]);
    expect(parseContract('ItemProgressData', first.body.data)).toEqual({
      ...videoCompleted,
      completedAt: new Date(videoCompleted.completedAt).toISOString(),
    });
    expect(retry.body.data).toEqual(first.body.data);
    await put(optional.id).expect(200);

    const progress = await getProgress()
      .set('X-Request-Id', 'progress-e2e')
      .expect('X-Request-Id', 'progress-e2e')
      .expect(200);
    expect(progress.body.meta).toEqual({ requestId: 'progress-e2e' });
    expect(
      parseContract('CourseProgressData', progress.body.data),
    ).toMatchObject({
      status: 'IN_PROGRESS',
      completedRequiredItems: 1,
      progressPercent: 50,
      completedAt: null,
    });
    expect(records).toHaveLength(2);
  });

  it('rejects invalid, unauthorized and version-mismatched requests', async () => {
    const unauthenticated = await request(app.getHttpServer())
      .get(progressPath)
      .expect(401);
    expect(
      parseContract('ApiErrorResponse', unauthenticated.body).error.code,
    ).toBe('UNAUTHORIZED');
    const otherStudent = await request(app.getHttpServer())
      .get(progressPath)
      .set('X-Mock-User', 'studentA')
      .expect(403);
    expect(otherStudent.body.error.code).toBe('ENROLLMENT_REQUIRED');
    await put('not-a-uuid').expect(400);
    await put(video.id, {
      ...scenarios.requests.completeItem,
      completed: false,
    }).expect(400);
    const stale = await put(
      video.id,
      scenarios.requests.wrongContentVersion,
    ).expect(409);
    expect(stale.body.error.code).toBe('CONTENT_VERSION_MISMATCH');
    await put(quiz.id).expect(403);
    expect(complete).not.toHaveBeenCalled();
  });

  it('keeps a chapter with an outstanding assessment locked', async () => {
    await put(video.id).expect(200);
    const access = await getChapterAccess();
    expect(
      access.chapters.map(({ status, reason }) => ({ status, reason })),
    ).toEqual([
      { status: 'UNLOCKED', reason: null },
      { status: 'LOCKED', reason: 'PREVIOUS_CHAPTER_NOT_COMPLETED' },
    ]);
    const locked = await put(reading.id).expect(403);
    expect(locked.body.error.code).toBe('PREREQUISITE_NOT_COMPLETED');
  });

  it('unlocks a chapter using a passed result for the enrolled learner and policy', async () => {
    const statuses = async () =>
      (await getChapterAccess()).chapters.map(({ status }) => status);

    await put(video.id).expect(200);
    await deliver(chapterAttempt79);
    const differentResults = [
      { assessmentVersion: 1 },
      { userId: providers.identity.studentA.id },
      { quizType: 'PRACTICE' as const },
      { passingScorePercent: 75 },
    ];
    for (const [index, changes] of differentResults.entries()) {
      await deliver({
        ...chapterAttempt80,
        eventId: `00000000-0000-4000-8000-00000000061${index}`,
        payload: {
          ...chapterAttempt80.payload,
          attemptId: `00000000-0000-4000-8000-00000000051${index}`,
          ...changes,
        },
      });
      expect(await statuses()).toEqual(['UNLOCKED', 'LOCKED']);
    }
    await put(reading.id).expect(403);

    await deliver(chapterAttempt80);
    expect(await statuses()).toEqual(['COMPLETED', 'UNLOCKED']);
    await deliver(chapterAttempt80);
    await deliver({
      ...chapterAttempt79,
      eventId: '00000000-0000-4000-8000-000000000607',
      payload: {
        ...chapterAttempt79.payload,
        attemptId: '00000000-0000-4000-8000-000000000504',
      },
    });
    expect(await statuses()).toEqual(['COMPLETED', 'UNLOCKED']);
    await put(reading.id).expect(200);

    const beforeFinal = await getProgress().expect(200);
    expect(beforeFinal.body.data).toMatchObject({
      status: 'IN_PROGRESS',
      progressPercent: 100,
      passedRequiredAssessments: 0,
    });
    await deliver(courseAttempt);
    const done = await getProgress().expect(200);
    expect(done.body.data).toMatchObject({
      status: 'COMPLETED',
      passedRequiredAssessments: 1,
      completedAt: new Date(courseAttempt.payload.gradedAt).toISOString(),
    });
  });

  it('sends inconsistent grades to the dead-letter queue before acknowledging', async () => {
    await deliver({
      ...chapterAttempt79,
      payload: { ...chapterAttempt79.payload, passed: true },
    });
    expect(record).not.toHaveBeenCalled();
    expect(forwardToDlq).toHaveBeenCalledWith(
      'learning.quiz-results.v2.dlq',
      expect.any(Buffer),
      expect.objectContaining({
        headers: { 'x-learning-failure': 'INVALID_RESULT' },
      }),
      expect.any(Function),
    );
  });

  it('routes a conflicting assessment event to the DLQ without retrying', async () => {
    record.mockResolvedValueOnce('CONFLICT');
    await deliver(courseAttempt);

    expect(record).toHaveBeenCalledTimes(1);
    expect(forwardToDlq).toHaveBeenCalledWith(
      'learning.quiz-results.v2.dlq',
      Buffer.from(JSON.stringify(courseAttempt)),
      expect.objectContaining({
        headers: { 'x-learning-failure': 'EVENT_CONFLICT' },
      }),
      expect.any(Function),
    );
  });

  it('lists chapters in order and unlocks the next chapter when its prerequisite is complete', async () => {
    structure.outline.chapters.reverse();
    structure.completionPolicy.chapterPolicies[0].requiredAssessments = [];

    const initialAccess = await getChapterAccess();
    expect(initialAccess).toEqual({
      courseId: enrollment.courseId,
      contentVersion: enrollment.contentVersion,
      chapters: [
        {
          chapterId: chapterOne.id,
          order: chapterOne.order,
          contentVersion: enrollment.contentVersion,
          status: 'UNLOCKED',
          reason: null,
        },
        {
          chapterId: chapterTwo.id,
          order: chapterTwo.order,
          contentVersion: enrollment.contentVersion,
          status: 'LOCKED',
          reason: 'PREVIOUS_CHAPTER_NOT_COMPLETED',
        },
      ],
    });

    await put(video.id).expect(200);
    const unlocked = await getChapterAccess();
    expect(
      unlocked.chapters.map(({ status, reason }) => ({ status, reason })),
    ).toEqual([
      { status: 'COMPLETED', reason: null },
      { status: 'UNLOCKED', reason: null },
    ]);
    await put(reading.id).expect(200);
    expect(
      (await getChapterAccess()).chapters.map(({ status }) => status),
    ).toEqual(['COMPLETED', 'COMPLETED']);
  });

  it('rejects chapter access reads outside the learner enrollment', async () => {
    const result = await request(app.getHttpServer())
      .get(chapterAccessPath)
      .set('X-Mock-User', 'studentA')
      .expect(403);
    expect(parseContract('ApiErrorResponse', result.body).error.code).toBe(
      'ENROLLMENT_REQUIRED',
    );
  });

  it('rejects a Course snapshot that differs from the pinned enrollment', async () => {
    structure.outline.contentVersion = enrollment.contentVersion + 1;
    const progress = await getProgress().expect(409);
    expect(progress.body.error.code).toBe('CONTENT_VERSION_MISMATCH');
    await request(app.getHttpServer())
      .get(chapterAccessPath)
      .set('X-Mock-User', 'studentB')
      .expect(409);
    await put(video.id).expect(409);
    expect(complete).not.toHaveBeenCalled();
  });

  it('keeps a course with a required assessment in progress at 100 percent', async () => {
    structure.completionPolicy.chapterPolicies[0].requiredAssessments = [];
    await put(video.id).expect(200);
    await put(reading.id).expect(200);
    const result = await getProgress().expect(200);
    expect(parseContract('CourseProgressData', result.body.data)).toMatchObject(
      {
        progressPercent: 100,
        status: 'IN_PROGRESS',
        totalRequiredAssessments: 1,
        completedAt: null,
      },
    );
  });
});
