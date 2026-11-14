import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { parseContract } from '@lms/contracts';
import type {
  GradedAssessmentSummary,
  LearningResumeData,
} from '@lms/contracts';
import request from 'supertest';
import type { App } from 'supertest/types';
import { ProgressModule } from '../src/modules/progress/progress.module';
import { CourseClient } from '../src/integrations/course.client';
import type { AssessmentAttempt } from '../src/modules/progress-sync/entities/assessment-attempt.entity';
import { AssessmentAttemptsRepository } from '../src/modules/progress-sync/repositories/assessment-attempts.repository';
import type { ItemCompletion } from '../src/modules/progress/entities/item-completion.entity';
import type { LessonCompletion } from '../src/modules/progress/entities/lesson-completion.entity';
import { ItemCompletionsRepository } from '../src/modules/progress/repositories/item-completions.repository';
import { LessonCompletionsRepository } from '../src/modules/progress/repositories/lesson-completions.repository';
import { LearningResumeRepository } from '../src/modules/progress/repositories/learning-resume.repository';
import { CourseItemMigrationsRepository } from '../src/modules/progress/repositories/course-item-migrations.repository';
import providers from './fixtures/learning-providers.mock.json';

const enrollment = parseContract(
  'EnrollmentSnapshotData',
  providers.course.enrollment,
);
const original = parseContract(
  'CourseLearningStructure',
  providers.course.structure,
);
const course = providers.course.publishedCourse;
const base = `/api/v1/learning/courses/${enrollment.courseId}`;

describe('PRG boundary cases through the NestJS APIs', () => {
  let app: INestApplication<App>;
  let structure = structuredClone(original);
  let records: ItemCompletion[] = [];
  let finished: LessonCompletion[] = [];
  let attempts: AssessmentAttempt[] = [];
  let checkpoint: LearningResumeData | null = null;
  const previousEnv = { ...process.env };

  const lessonRepository = {
    list: () => Promise.resolve(finished),
    find: ({ lessonId }: { lessonId: string }) =>
      Promise.resolve(
        finished.find((row) => row.lessonId === lessonId) ?? null,
      ),
    complete: (key: Omit<LessonCompletion, 'completedAt'>) => {
      let saved = finished.find((row) => row.lessonId === key.lessonId);
      if (!saved) {
        saved = { ...key, completedAt: new Date() };
        finished.push(saved);
      }
      return Promise.resolve(saved);
    },
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.MOCK_AUTH = 'true';
    delete process.env.RABBITMQ_URL;
    const testing = await Test.createTestingModule({
      imports: [ProgressModule],
    })
      .overrideProvider(CourseClient)
      .useValue({
        async *enrollments({ userId }: { userId: string }) {
          await Promise.resolve();
          if (userId === enrollment.userId) yield enrollment;
        },
        async *enrolledCourses({ userId }: { userId: string }) {
          await Promise.resolve();
          if (userId === enrollment.userId) yield { enrollment, course };
        },
        structure: () => Promise.resolve(structure),
      })
      .overrideProvider(ItemCompletionsRepository)
      .useValue({
        list: () => Promise.resolve(records),
        complete: (
          enrollmentId: string,
          contentVersion: number,
          learningItemId: string,
        ) => {
          let saved = records.find(
            (row) => row.learningItemId === learningItemId,
          );
          if (!saved) {
            saved = {
              enrollmentId,
              contentVersion,
              learningItemId,
              completedAt: new Date(),
            };
            records.push(saved);
          }
          return Promise.resolve(saved);
        },
      })
      .overrideProvider(LessonCompletionsRepository)
      .useValue(lessonRepository)
      .overrideProvider(AssessmentAttemptsRepository)
      .useValue({ list: () => Promise.resolve(attempts) })
      .overrideProvider(LearningResumeRepository)
      .useValue({
        find: () =>
          Promise.resolve(
            checkpoint && {
              ...checkpoint,
              updatedAt: new Date(checkpoint.updatedAt),
            },
          ),
      })
      .overrideProvider(CourseItemMigrationsRepository)
      .useValue({ list: () => Promise.resolve([]) })
      .compile();
    app = testing.createNestApplication();
    await app.init();
  });

  beforeEach(() => {
    structure = structuredClone(original);
    records = [];
    finished = [];
    attempts = [];
    checkpoint = null;
  });

  afterAll(async () => {
    await app?.close();
    process.env = previousEnv;
  });

  function completeItem(id: string) {
    return request(app.getHttpServer())
      .put(`/api/v1/learning/items/${id}/completion`)
      .set('X-Mock-User', 'studentB')
      .send({ completed: true, contentVersion: enrollment.contentVersion });
  }

  function completeLesson(id: string) {
    return request(app.getHttpServer())
      .put(`/api/v1/learning/lessons/${id}/completion`)
      .set('X-Mock-User', 'studentB')
      .send({ completed: true, contentVersion: enrollment.contentVersion });
  }

  function get(path: string, user = 'studentB') {
    return request(app.getHttpServer()).get(path).set('X-Mock-User', user);
  }

  function addResult(changes: Partial<GradedAssessmentSummary> = {}) {
    const payload = parseContract('GradedAssessmentSummary', {
      ...providers.quiz.attemptGraded.payload,
      attemptId: randomUUID(),
      ...changes,
    });
    attempts.push({
      attemptId: payload.attemptId,
      assessmentVersion: payload.assessmentVersion,
      userId: payload.userId,
      courseId: payload.courseId,
      gradedAt: new Date(payload.gradedAt),
      eventId: randomUUID(),
      result: payload,
    });
  }

  it('PRG-01 accepts a valid UUID regardless of letter case', async () => {
    const oldId = structure.outline.chapters[0].lessons[0].items[0].id;
    const itemId = 'abcdefab-cdef-4abc-8def-abcdefabcdef';
    structure.outline.chapters[0].lessons[0].items[0].id = itemId;
    structure.completionPolicy.requiredItemIds =
      structure.completionPolicy.requiredItemIds.map((id) =>
        id === oldId ? itemId : id,
      );
    structure.completionPolicy.chapterPolicies[0].requiredItemIds = [itemId];
    const result = await completeItem(itemId.toUpperCase()).expect(200);
    expect(result.body.data.learningItemId).toBe(itemId);
  });

  it('PRG-01/02 excludes a lesson containing only optional items from the percentage', async () => {
    const lesson = structure.outline.chapters[0].lessons[0];
    const video = lesson.items[0];
    const optionalId = randomUUID();
    structure.outline.chapters[0].lessons.push({
      ...lesson,
      id: optionalId,
      order: 1,
      items: [{ ...lesson.items[1], id: randomUUID(), lessonId: optionalId }],
    });
    await completeItem(video.id).expect(200);
    await completeLesson(lesson.id).expect(200);
    await completeLesson(optionalId).expect(200);
    const progress = parseContract(
      'CourseProgressData',
      (await get(`${base}/progress`).expect(200)).body.data,
    );
    expect(progress).toMatchObject({
      completedRequiredLessons: 1,
      totalRequiredLessons: 2,
      lessonProgressPercent: 50,
    });
    expect(
      (await get(`${base}/chapters/access`).expect(200)).body.data.chapters[0],
    ).toMatchObject({
      completedLessons: 2,
      totalLessons: 2,
      progressPercent: 100,
    });
  });

  it('PRG-01/03 enforces sequential requirements declared only in a chapter policy', async () => {
    const [chapterOne, chapterTwo] = structure.outline.chapters;
    const firstLesson = chapterOne.lessons[0];
    const nextLesson = {
      ...chapterTwo.lessons[0],
      chapterId: chapterOne.id,
      order: 1,
    };
    chapterOne.lessons.push(nextLesson);
    structure.outline.chapters = [chapterOne];
    structure.completionPolicy.requiredItemIds = [];
    structure.completionPolicy.chapterPolicies = [
      {
        chapterId: chapterOne.id,
        requiredItemIds: [firstLesson.items[0].id, nextLesson.items[0].id],
        requiredAssessments: [],
      },
    ];
    await completeItem(nextLesson.items[0].id).expect(403);
    await completeLesson(nextLesson.id).expect(403);
    await completeItem(firstLesson.items[0].id).expect(200);
    await completeItem(nextLesson.items[0].id).expect(200);
  });

  it('PRG-01/02/05 waits for required lesson confirmations after all item and quiz requirements pass', async () => {
    const first = structure.outline.chapters[0].lessons[0];
    const second = structure.outline.chapters[1].lessons[0];
    await completeItem(first.items[0].id).expect(200);
    addResult(parseContract('GradedAssessmentSummary', providers.quiz.chapterAttempt80.payload));
    await completeItem(second.items[0].id).expect(200);
    addResult();
    const progress = async () =>
      (await get(`${base}/progress`).expect(200)).body.data;
    expect(await progress()).toMatchObject({
      status: 'IN_PROGRESS',
      progressPercent: 100,
      lessonProgressPercent: 0,
      passedRequiredAssessments: 1,
      completedAt: null,
    });
    expect(
      (await get('/api/v1/learning/me/dashboard').expect(200)).body.data
        .courses[0].nextStep,
    ).toMatchObject({ kind: 'COMPLETE_LESSON', lessonId: first.id });
    await completeLesson(first.id).expect(200);
    expect(await progress()).toMatchObject({
      status: 'IN_PROGRESS',
      lessonProgressPercent: 50,
    });
    const last = (await completeLesson(second.id).expect(200)).body.data;
    expect(await progress()).toMatchObject({
      status: 'COMPLETED',
      lessonProgressPercent: 100,
      completedAt: last.completedAt,
    });
    expect(
      (await get('/api/v1/learning/me/dashboard').expect(200)).body.data
        .courses[0].nextStep,
    ).toBeNull();
  });

  it('PRG-01/03 ignores a graded quiz result with a threshold from another policy', async () => {
    const lesson = structure.outline.chapters[0].lessons[0];
    const item = lesson.items.find((row) => row.type === 'QUIZ')!;
    structure.completionPolicy.requiredItemIds.push(item.id);
    await completeItem(lesson.items[0].id).expect(200);
    addResult({
      passingScorePercent: 60,
      score: 6,
      maxScore: 10,
      passed: true,
    });
    const result = await get(
      `/api/v1/learning/lessons/${lesson.id}/progress`,
    ).expect(200);
    expect(
      result.body.data.items.find(
        (row: { learningItemId: string }) => row.learningItemId === item.id,
      ).status,
    ).toBe('NOT_STARTED');
    await completeLesson(lesson.id).expect(409);
    addResult();
    await completeLesson(lesson.id).expect(200);
  });

  it('PRG-01/05 accepts a submitted practice quiz item without treating it as a passed graded assessment', async () => {
    const lesson = structure.outline.chapters[0].lessons[0];
    const item = lesson.items.find((row) => row.type === 'QUIZ')!;
    structure.completionPolicy.requiredItemIds.push(item.id);
    // Practice and graded requirements refer to separate quizzes.
    if (item.type === 'QUIZ') item.quizId = randomUUID();
    await completeItem(lesson.items[0].id).expect(200);
    addResult({
      quizId: item.type === 'QUIZ' ? item.quizId : '',
      quizType: 'PRACTICE',
      score: 2,
      passed: false,
    });
    await completeLesson(lesson.id).expect(200);
    const progress = (await get(`${base}/progress`).expect(200)).body.data;
    expect(progress.passedRequiredAssessments).toBe(0);
    const dashboard = (await get('/api/v1/learning/me/dashboard').expect(200))
      .body.data;
    expect(dashboard.recentQuizzes).toEqual([]);
    await completeItem(item.id).expect(403);
  });

  it('PRG-05 limits recent quizzes to ten valid results ordered by grading time', async () => {
    for (let index = 0; index < 12; index += 1) {
      addResult({
        gradedAt: new Date(Date.UTC(2026, 0, 15, 10, index)).toISOString(),
      });
    }
    addResult({ assessmentVersion: 99, gradedAt: '2026-01-15T11:00:00Z' });
    const dashboard = parseContract(
      'LearningDashboardData',
      (await get('/api/v1/learning/me/dashboard').expect(200)).body.data,
    );
    expect(dashboard.recentQuizzes).toHaveLength(10);
    expect(dashboard.recentQuizzes[0].gradedAt).toBe(
      '2026-01-15T10:11:00.000Z',
    );
    expect(dashboard.recentQuizzes[9].gradedAt).toBe(
      '2026-01-15T10:02:00.000Z',
    );
    expect(
      (await get('/api/v1/learning/me/dashboard', 'studentA').expect(200)).body
        .data.recentQuizzes,
    ).toEqual([]);
  });

  it('PRG-05/08 avoids resuming a checkpoint in a locked chapter', async () => {
    const [firstChapter, secondChapter] = structure.outline.chapters;
    checkpoint = {
      userId: enrollment.userId,
      courseId: enrollment.courseId,
      contentVersion: enrollment.contentVersion,
      lessonId: secondChapter.lessons[0].id,
      learningItemId: secondChapter.lessons[0].items[0].id,
      positionSeconds: null,
      revision: 1,
      updatedAt: '2026-01-15T10:00:00Z',
    };
    await get(`${base}/resume`).expect(403);
    const dashboard = (await get('/api/v1/learning/me/dashboard').expect(200))
      .body.data;
    expect(dashboard.courses[0].nextStep).toMatchObject({
      kind: 'LEARNING_ITEM',
      learningItemId: firstChapter.lessons[0].items[0].id,
    });
  });
});
