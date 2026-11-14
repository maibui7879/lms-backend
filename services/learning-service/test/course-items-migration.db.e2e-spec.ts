import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { parseContract } from '@lms/contracts';
import type { MigrateCourseItemsRequest } from '@lms/contracts';
import type { DataSource } from 'typeorm';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { CourseClient } from '../src/integrations/course.client';
import { createLearningDataSource } from '../src/database/learning-database';
import { AddItemInvalidations1794528000006 } from '../src/database/migrations/1794528000006-add-item-invalidations';
import { CourseItemMigration } from '../src/modules/progress/entities/course-item-migration.entity';
import { ItemCompletion } from '../src/modules/progress/entities/item-completion.entity';
import { LessonCompletion } from '../src/modules/progress/entities/lesson-completion.entity';
import { LearningResume } from '../src/modules/progress/entities/learning-resume.entity';
import { AssessmentAttempt } from '../src/modules/progress-sync/entities/assessment-attempt.entity';
import { AssessmentSyncReceipt } from '../src/modules/progress-sync/entities/assessment-sync-receipt.entity';
import { AssessmentAttemptsRepository } from '../src/modules/progress-sync/repositories/assessment-attempts.repository';
import { ItemCompletionsRepository } from '../src/modules/progress/repositories/item-completions.repository';
import providers from './fixtures/learning-providers.mock.json';

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
const token = 'fixture-learning-internal-token';

suite('Critical item migration with PostgreSQL and fake Course', () => {
  let app: INestApplication<App>;
  let source: DataSource;
  const oldEnv = { ...process.env };
  const courseId = randomUUID();
  const enrollment = {
    ...providers.course.enrollment,
    enrollmentId: randomUUID(),
    courseId,
  };
  const structure = parseContract(
    'CourseLearningStructure',
    JSON.parse(
      JSON.stringify(providers.course.structure).replaceAll(
        providers.course.enrollment.courseId,
        courseId,
      ),
    ),
  );
  const course = { ...providers.course.publishedCourse, id: courseId };
  const [chapterOne, chapterTwo] = structure.outline.chapters;
  const first = chapterOne.lessons[0];
  const second = chapterTwo.lessons[0];
  const [video, optional, quizItem] = first.items;
  const revisionId = randomUUID();
  const revision = {
    id: revisionId,
    courseId,
    baseContentVersion: 1,
    contentVersion: 2,
    status: 'PUBLISHED',
    createdBy: course.instructorId,
    version: 1,
    createdAt: '2026-11-14T08:00:00Z',
    submittedAt: '2026-11-14T08:01:00Z',
    publishedAt: '2026-11-14T08:02:00Z',
    updateType: 'CRITICAL',
    migrationPolicy: 'MIGRATE_AFFECTED_ITEMS',
  };
  const originalContext = parseContract('CourseItemMigrationContext', {
    revision,
    items: [video, optional, quizItem].map((item) => ({
      item: {
        ...item,
        id: randomUUID(),
        revisionId,
        contentVersion: 2,
        ...(item.type === 'VIDEO' ? { durationSeconds: 30 } : {}),
        ...(item.type === 'QUIZ'
          ? { assessmentVersion: item.assessmentVersion + 1 }
          : {}),
      },
      previousItems: [item],
      requiredAssessment:
        item.type === 'QUIZ'
          ? {
              ...structure.completionPolicy.requiredAssessments[0],
              assessmentVersion: item.assessmentVersion + 1,
            }
          : null,
    })),
  });
  let context = structuredClone(originalContext);
  const path = `/api/v1/learning/courses/${courseId}`;
  const migrationPath = `/api/v1/internal/courses/${courseId}/migrations`;
  const newIds = originalContext.items.map(({ item }) => item.id);
  const fakeCourse = {
    async *enrollments({ userId }: { userId: string }) {
      await Promise.resolve();
      if (userId === enrollment.userId) yield enrollment;
    },
    async *enrolledCourses({ userId }: { userId: string }) {
      await Promise.resolve();
      if (userId === enrollment.userId) yield { enrollment, course };
    },
    structure: () => Promise.resolve(structure),
    migrationContext: () => Promise.resolve(context),
  };

  beforeAll(async () => {
    const url = new URL(databaseUrl!);
    if (
      !['127.0.0.1', 'localhost'].includes(url.hostname) ||
      !url.pathname.endsWith('_test')
    )
      throw new Error('Use a local *_test PostgreSQL database');
    source = createLearningDataSource(databaseUrl);
    await source.initialize();
    await source.runMigrations();
    process.env.NODE_ENV = 'test';
    process.env.MOCK_AUTH = 'true';
    process.env.LEARNING_SERVICE_TOKEN = token;
    process.env.DATABASE_URL = databaseUrl;
    delete process.env.RABBITMQ_URL;
    const testing = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CourseClient)
      .useValue(fakeCourse)
      .compile();
    app = testing.createNestApplication();
    await app.init();
  });

  async function clear() {
    await source.getRepository(CourseItemMigration).delete({ courseId });
    for (const entity of [ItemCompletion, LessonCompletion, LearningResume])
      await source
        .getRepository(entity)
        .delete({ enrollmentId: enrollment.enrollmentId });
    await source.getRepository(AssessmentAttempt).delete({ courseId });
    await source.getRepository(AssessmentSyncReceipt).delete({ courseId });
  }

  beforeEach(async () => {
    await clear();
    context = structuredClone(originalContext);
  });

  afterAll(async () => {
    await app?.close();
    if (source?.isInitialized) {
      await clear();
      await source.destroy();
    }
    process.env = oldEnv;
  });

  function get(url: string) {
    return request(app.getHttpServer()).get(url).set('X-Mock-User', 'studentB');
  }

  function completeItem(id = video.id) {
    return request(app.getHttpServer())
      .put(`/api/v1/learning/items/${id}/completion`)
      .set('X-Mock-User', 'studentB')
      .send({ completed: true, contentVersion: 1 });
  }

  function completeLesson() {
    return request(app.getHttpServer())
      .put(`/api/v1/learning/lessons/${first.id}/completion`)
      .set('X-Mock-User', 'studentB')
      .send({ completed: true, contentVersion: 1 });
  }

  function migrate(changes: Partial<MigrateCourseItemsRequest> = {}) {
    return request(app.getHttpServer())
      .post(migrationPath)
      .set('Authorization', `Bearer ${token}`)
      .send({
        revisionId,
        itemIds: [newIds[0]],
        policy: 'REQUIRE_RECOMPLETION',
        reason: 'Nội dung video đã được sửa',
        ...changes,
      });
  }

  async function grade(
    fixture = providers.quiz.chapterAttempt80,
    changes = {},
  ) {
    const event = parseContract('AttemptGradedV2Event', {
      ...fixture,
      eventId: randomUUID(),
      payload: {
        ...fixture.payload,
        courseId,
        attemptId: randomUUID(),
        ...changes,
      },
    });
    expect(await app.get(AssessmentAttemptsRepository).record(event)).toBe(
      'SYNCED',
    );
    return event;
  }

  it('upgrades old completion records to COMPLETED with empty invalidation metadata', async () => {
    const runner = source.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      const schema = `migration_test_${randomUUID().replaceAll('-', '')}`;
      await runner.query(`CREATE SCHEMA ${schema}`);
      await runner.query(`SET LOCAL search_path TO ${schema}, pg_catalog`);
      await runner.query(`CREATE TABLE learning_item_completions (
        enrollment_id uuid, content_version int, learning_item_id uuid,
        completed_at timestamptz DEFAULT CURRENT_TIMESTAMP
      )`);
      await runner.query(
        'INSERT INTO learning_item_completions (enrollment_id,content_version,learning_item_id) VALUES ($1,1,$2)',
        [enrollment.enrollmentId, video.id],
      );
      await runner.query(
        'CREATE TABLE learning_lesson_completions (completed_at timestamptz)',
      );
      await runner.query(
        'CREATE TABLE learning_resume_checkpoints (revision int)',
      );
      await new AddItemInvalidations1794528000006().up(runner);
      const [row] = await runner.query(
        'SELECT status,invalidated_at,invalidation_reason FROM learning_item_completions',
      );
      expect(row).toEqual({
        status: 'COMPLETED',
        invalidated_at: null,
        invalidation_reason: null,
      });
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  });

  it('invalidates only the selected item and lesson, locks the next chapter, then accepts recompletion', async () => {
    await completeItem().expect(200);
    await completeItem(optional.id).expect(200);
    await completeLesson().expect(200);
    await grade();
    expect(
      (await get(`${path}/chapters/access`).expect(200)).body.data.chapters[1]
        .status,
    ).toBe('UNLOCKED');
    const before = (await get(`${path}/progress`).expect(200)).body.data;
    expect(before.lessonProgressPercent).toBe(50);
    const originalRows = await source
      .getRepository(ItemCompletion)
      .countBy({ enrollmentId: enrollment.enrollmentId });
    await migrate().expect(204);
    const lesson = parseContract(
      'LessonProgressData',
      (await get(`/api/v1/learning/lessons/${first.id}/progress`).expect(200))
        .body.data,
    );
    expect(lesson.status).toBe('OUTDATED');
    expect(
      lesson.items.find(({ learningItemId }) => learningItemId === video.id),
    ).toMatchObject({
      status: 'OUTDATED',
      invalidatedAt: expect.any(String),
      invalidationReason: 'Nội dung video đã được sửa',
    });
    expect(
      lesson.items.find(({ learningItemId }) => learningItemId === optional.id)
        ?.status,
    ).toBe('COMPLETED');
    expect((await get(`${path}/progress`).expect(200)).body.data).toMatchObject(
      {
        contentVersion: 1,
        status: 'OUTDATED',
        completedRequiredItems: 0,
        lessonProgressPercent: 0,
      },
    );
    expect(
      (await get(`${path}/chapters/access`).expect(200)).body.data.chapters[1]
        .status,
    ).toBe('LOCKED');
    const next = (await get('/api/v1/learning/me/dashboard').expect(200)).body
      .data.courses[0].nextStep;
    expect(next).toMatchObject({
      kind: 'LEARNING_ITEM',
      learningItemId: video.id,
      positionSeconds: null,
    });
    await migrate().expect(204);
    expect(
      await source
        .getRepository(ItemCompletion)
        .countBy({ enrollmentId: enrollment.enrollmentId }),
    ).toBe(originalRows);
    await completeItem().expect(200);
    await completeLesson().expect(200);
    const completedAgain = (
      await get(`/api/v1/learning/lessons/${first.id}/progress`).expect(200)
    ).body.data;
    expect(completedAgain.status).toBe('COMPLETED');
    expect(
      completedAgain.items.find(
        (item: { learningItemId: string }) => item.learningItemId === video.id,
      ),
    ).toMatchObject({
      status: 'COMPLETED',
      invalidatedAt: null,
      invalidationReason: null,
    });
    await migrate().expect(204);
    expect(
      (await get(`${path}/progress`).expect(200)).body.data
        .lessonProgressPercent,
    ).toBe(50);
  });

  it('NOTIFY_ONLY preserves completion and its metadata clears after a later relearning', async () => {
    await completeItem().expect(200);
    await completeLesson().expect(200);
    const before = (await get(`${path}/progress`).expect(200)).body.data;
    await migrate({ policy: 'NOTIFY_ONLY' }).expect(204);
    const after = (await get(`${path}/progress`).expect(200)).body.data;
    expect(after).toEqual(before);
    const state = (
      await get(`/api/v1/learning/lessons/${first.id}/progress`).expect(200)
    ).body.data.items[0];
    expect(state).toMatchObject({
      status: 'COMPLETED',
      invalidatedAt: null,
      invalidationReason: 'Nội dung video đã được sửa',
    });
    await migrate().expect(204);
    await completeItem().expect(200);
    await completeLesson().expect(200);
    const learnedAgain = (
      await get(`/api/v1/learning/lessons/${first.id}/progress`).expect(200)
    ).body.data.items[0];
    expect(learnedAgain).toMatchObject({
      status: 'COMPLETED',
      invalidatedAt: null,
      invalidationReason: null,
    });
  });

  it('rejects a completion based on requirements read before a concurrent migration', async () => {
    await completeItem().expect(200);
    const repository = app.get(ItemCompletionsRepository);
    const save = repository.complete.bind(repository);
    const intercept = jest
      .spyOn(repository, 'complete')
      .mockImplementationOnce(async (...args) => {
        await migrate().expect(204);
        return save(...args);
      });
    try {
      const result = await completeItem().expect(409);
      expect(result.body.error.code).toBe('REVISION_CONFLICT');
    } finally {
      intercept.mockRestore();
    }
    expect((await get(`${path}/progress`).expect(200)).body.data.status).toBe(
      'OUTDATED',
    );
    await completeItem().expect(200);
  });

  it('rolls back a batch if a later item conflicts with an already applied migration', async () => {
    await completeItem().expect(200);
    await completeItem(optional.id).expect(200);
    await migrate({ itemIds: [newIds[1]] }).expect(204);
    await migrate({
      itemIds: newIds.slice(0, 2),
      reason: 'conflicting reason',
    }).expect(409);
    expect(
      await source.getRepository(CourseItemMigration).countBy({ courseId }),
    ).toBe(1);
    const videoRow = await source
      .getRepository(ItemCompletion)
      .findOneByOrFail({
        enrollmentId: enrollment.enrollmentId,
        learningItemId: video.id,
      });
    expect(videoRow.status).toBe('COMPLETED');
  });

  it('keeps a newer correction when an older migration arrives late', async () => {
    await completeItem().expect(200);
    const latestRevision = randomUUID();
    context.revision = {
      ...context.revision,
      id: latestRevision,
      baseContentVersion: 2,
      contentVersion: 3,
    };
    context.items[0].item = {
      ...context.items[0].item,
      id: randomUUID(),
      revisionId: latestRevision,
      contentVersion: 3,
    };
    await migrate({
      revisionId: latestRevision,
      itemIds: [context.items[0].item.id],
    }).expect(204);
    await completeItem().expect(200);
    context = structuredClone(originalContext);
    await migrate().expect(204);
    const row = (
      await get(`/api/v1/learning/lessons/${first.id}/progress`).expect(200)
    ).body.data.items[0];
    expect(row.status).toBe('COMPLETED');
    expect(row.invalidatedAt).toBeNull();
  });

  it('validates every item before a batch and applies valid batches atomically', async () => {
    await completeItem().expect(200);
    await completeItem(optional.id).expect(200);
    await migrate({ itemIds: [newIds[0], randomUUID()] }).expect(422);
    expect(
      await source.getRepository(CourseItemMigration).countBy({ courseId }),
    ).toBe(0);
    expect(
      (await get(`/api/v1/learning/lessons/${first.id}/progress`).expect(200))
        .body.data.items[0].status,
    ).toBe('COMPLETED');
    await migrate({ itemIds: newIds.slice(0, 2) }).expect(204);
    expect(
      await source.getRepository(CourseItemMigration).countBy({ courseId }),
    ).toBe(2);
    await migrate({
      reason: 'different payload for the same migration',
    }).expect(409);
    expect(
      await source.getRepository(CourseItemMigration).countBy({ courseId }),
    ).toBe(2);
  });

  it('rejects user credentials, wrong ownership and unpublished or NORMAL revisions', async () => {
    await request(app.getHttpServer())
      .post(migrationPath)
      .set('X-Mock-User', 'adminA')
      .send({})
      .expect(401);
    await request(app.getHttpServer())
      .post(migrationPath)
      .set('Authorization', 'Bearer wrong-token')
      .send({})
      .expect(401);
    await migrate({ itemIds: [newIds[0], newIds[0]] }).expect(400);
    await migrate({ itemIds: [] }).expect(400);
    await migrate({ revisionId: randomUUID() }).expect(422);
    context.revision.courseId = randomUUID();
    await migrate().expect(422);
    context = structuredClone(originalContext);
    context.revision.status = 'DRAFT';
    await migrate().expect(409);
    context = structuredClone(originalContext);
    context.revision.updateType = 'NORMAL';
    await migrate().expect(409);
  });

  it.each(['RESET', 'NOT_STARTED', 'IN_PROGRESS'] as const)(
    'uses the patched duration and completes a %s row',
    async (status) => {
      await completeItem().expect(200);
      await migrate().expect(204);
      const save = (positionSeconds: number) =>
        request(app.getHttpServer())
          .put(`${path}/resume`)
          .set('X-Mock-User', 'studentB')
          .send({
            lessonId: first.id,
            learningItemId: video.id,
            contentVersion: 1,
            expectedRevision: 0,
            positionSeconds,
          });
      await save(60).expect(400);
      await save(15).expect(200);
      await source
        .getRepository(ItemCompletion)
        .update(
          { enrollmentId: enrollment.enrollmentId, learningItemId: video.id },
          { status },
        );
      expect((await get(`${path}/progress`).expect(200)).body.data.status).toBe(
        status === 'RESET' ? 'RESET' : 'OUTDATED',
      );
      await completeItem().expect(200);
      const row = await source.getRepository(ItemCompletion).findOneByOrFail({
        enrollmentId: enrollment.enrollmentId,
        learningItemId: video.id,
      });
      expect(row).toMatchObject({
        status: 'COMPLETED',
        invalidatedAt: null,
        invalidationReason: null,
      });
    },
  );

  it('starts an outdated video checkpoint at zero and can save a new position with the existing revision', async () => {
    const save = (positionSeconds: number, expectedRevision: number) =>
      request(app.getHttpServer())
        .put(`${path}/resume`)
        .set('X-Mock-User', 'studentB')
        .send({
          lessonId: first.id,
          learningItemId: video.id,
          contentVersion: 1,
          expectedRevision,
          positionSeconds,
        });
    await save(60, 0).expect(200);
    await migrate().expect(204);
    const stale = (await get(`${path}/resume`).expect(200)).body.data;
    expect(stale).toMatchObject({ positionSeconds: 0, revision: 1 });
    await save(15, 1).expect(200);
    const nextStep = (await get('/api/v1/learning/me/dashboard').expect(200))
      .body.data.courses[0].nextStep;
    expect(nextStep).toMatchObject({
      learningItemId: video.id,
      positionSeconds: 15,
    });
  });

  it('keeps historical quiz attempts and requires a passed result from the new assessment version', async () => {
    await completeItem().expect(200);
    await completeLesson().expect(200);
    await grade();
    await completeItem(second.items[0].id).expect(200);
    await grade(providers.quiz.attemptGraded);
    expect((await get(`${path}/progress`).expect(200)).body.data.status).toBe(
      'COMPLETED',
    );
    await migrate({ itemIds: [newIds[2]] }).expect(204);
    const invalidated = (await get(`${path}/progress`).expect(200)).body.data;
    expect(invalidated.status).not.toBe('COMPLETED');
    expect(invalidated.passedRequiredAssessments).toBe(0);
    await grade(providers.quiz.attemptGraded);
    expect(
      (await get(`${path}/progress`).expect(200)).body.data
        .passedRequiredAssessments,
    ).toBe(0);
    await grade(providers.quiz.attemptGraded, {
      assessmentVersion: 2,
      gradedAt: new Date(Date.now() + 1000).toISOString(),
    });
    expect((await get(`${path}/progress`).expect(200)).body.data.status).toBe(
      'COMPLETED',
    );
    expect(
      await source.getRepository(AssessmentAttempt).countBy({ courseId }),
    ).toBe(4);
    expect(
      (await get(`${path}/me/quiz-scores`).expect(200)).body.data.items,
    ).toHaveLength(3);
  });
});
