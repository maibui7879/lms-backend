import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { parseContract } from '@lms/contracts';
import type { GradedAssessmentSummary } from '@lms/contracts';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { createLearningDataSource } from '../src/database/learning-database';
import { CourseSkill } from '../src/modules/mastery/entities/course-skill.entity';
import { AssessmentAttempt } from '../src/modules/progress-sync/entities/assessment-attempt.entity';
import { AssessmentSyncReceipt } from '../src/modules/progress-sync/entities/assessment-sync-receipt.entity';
import { AssessmentAttemptsRepository } from '../src/modules/progress-sync/repositories/assessment-attempts.repository';
import { CourseItemMigration } from '../src/modules/progress/entities/course-item-migration.entity';
import { ItemCompletion } from '../src/modules/progress/entities/item-completion.entity';
import { LearningResume } from '../src/modules/progress/entities/learning-resume.entity';
import { LessonCompletion } from '../src/modules/progress/entities/lesson-completion.entity';
import { CourseItemMigrationsRepository } from '../src/modules/progress/repositories/course-item-migrations.repository';
import { legacyEnrollmentStart } from '../src/modules/progress/repositories/progress-scope';
import fixture from './fixtures/ins-03.mock.json';
import providers from './fixtures/learning-providers.mock.json';

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

suite(
  'INS-03/06/07/09 instructor reports with PostgreSQL and mock Course',
  () => {
    const env = { ...process.env };
    const courseId = randomUUID();
    const token = 'instructor-reports-course-token';
    const lesson = fixture.proposedDetailFields.an.completedLessons[0];
    const { an, binh } = fixture.learners;
    const anClass = randomUUID();
    const binhClass = randomUUID();
    const classes = { an: anClass, binh: binhClass };
    const enrolledIds = { an: randomUUID(), binh: randomUUID() };
    const skillId = randomUUID();
    const unknownEvidenceSkillId = randomUUID();
    const v1GradeAt = '2026-01-15T10:00:00Z';
    const v2GradeAt = '2026-01-16T10:00:00Z';
    const template = providers.quiz.attemptGraded;
    const quizId = 'aabbccdd-aabb-4bcc-8abc-112233445566';
    const chapterQuiz = providers.quiz.chapterAttempt80.payload;
    const snapshotRequests: number[] = [];
    let wrongSnapshot = false;
    let malformedRoster = false;
    let includeClasses = true;
    let anEnrolledAt = an.courseLearner.enrollment.enrolledAt;
    let anCancelled = false;
    let snapshotVariant:
      'normal' | 'uppercase-quiz' | 'foreign-item' | 'wrong-item-version';
    let source: DataSource | undefined;
    let app: INestApplication<App> | undefined;
    let sync: AssessmentAttemptsRepository;
    let migrations: CourseItemMigrationsRepository;

    function snapshot(version: number) {
      const data = parseContract(
        'CourseLearningStructure',
        structuredClone(providers.course.structure),
      );
      const { outline, completionPolicy } = data;
      Object.assign(outline, { courseId, contentVersion: version });
      Object.assign(completionPolicy, { courseId, contentVersion: version });
      for (const entry of [
        ...completionPolicy.requiredAssessments,
        ...completionPolicy.chapterPolicies.flatMap(
          ({ requiredAssessments }) => requiredAssessments,
        ),
      ]) {
        entry.assessmentVersion += version - 1;
        if (entry.quizId === template.payload.quizId)
          entry.quizId =
            snapshotVariant === 'uppercase-quiz'
              ? quizId.toUpperCase()
              : quizId;
      }
      for (const chapter of outline.chapters) {
        chapter.courseId = courseId;
        if (chapter.endSectionQuiz)
          chapter.endSectionQuiz.assessmentVersion += version - 1;
        for (const lesson of chapter.lessons) {
          lesson.courseId = courseId;
          for (const item of lesson.items) {
            Object.assign(item, { courseId, contentVersion: version });
            if (item.type === 'QUIZ') {
              item.assessmentVersion += version - 1;
              if (item.quizId === template.payload.quizId)
                item.quizId =
                  snapshotVariant === 'uppercase-quiz'
                    ? quizId.toUpperCase()
                    : quizId;
              if (snapshotVariant === 'foreign-item')
                item.courseId = fixture.unknownCourseId;
              if (snapshotVariant === 'wrong-item-version')
                item.contentVersion++;
            }
          }
        }
      }
      if (version === 2) {
        const addition = fixture.courseSnapshots.v2AdditionalRequiredLesson;
        const chapter = outline.chapters.find(
          ({ id }) => id === addition.chapterId,
        )!;
        const item = chapter.lessons[0].items.find(
          ({ type }) => type === 'READING',
        )!;
        chapter.lessons.push({
          ...chapter.lessons[0],
          id: addition.lessonId,
          title: addition.title,
          order: 1,
          items: [
            {
              ...item,
              id: addition.learningItemId,
              title: addition.title,
              lessonId: addition.lessonId,
              required: true,
            },
          ],
        });
        completionPolicy.requiredItemIds.push(addition.learningItemId);
        completionPolicy.chapterPolicies
          .find(({ chapterId }) => chapterId === chapter.id)!
          .requiredItemIds.push(addition.learningItemId);
      }
      return data;
    }

    const course = createServer((incoming, response) => {
      const url = new URL(incoming.url!, 'http://localhost');
      const send = (data: unknown) => {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ data }));
      };
      if (url.pathname === '/api/v1/enrollments/me') {
        const items =
          incoming.headers['x-mock-user'] === an.fixtureUser && !anCancelled
            ? [
                {
                  enrollment: {
                    ...an.courseLearner.enrollment,
                    courseId,
                    enrollmentId: enrolledIds.an,
                    enrolledAt: anEnrolledAt,
                  },
                  course: { ...providers.course.publishedCourse, id: courseId },
                },
              ]
            : [];
        return send({
          items,
          total: items.length,
          page: Number(url.searchParams.get('page')),
          limit: Number(url.searchParams.get('limit')),
        });
      }
      if (
        [courseId, fixture.emptyCourse.id].some(
          (id) => url.pathname === `/api/v1/courses/${id}/learners`,
        )
      ) {
        if (
          ![fixture.actors.owner, fixture.actors.admin].includes(
            String(incoming.headers['x-mock-user']),
          )
        )
          return response.writeHead(403).end();
        const page = Number(url.searchParams.get('page'));
        const limit = Number(url.searchParams.get('limit'));
        const roster = url.pathname.includes(fixture.emptyCourse.id)
          ? []
          : fixture.rosterOrder
              .filter((entry) => entry !== 'an' || !anCancelled)
              .map((entry) => {
                const key = entry as keyof typeof fixture.learners;
                const learner = fixture.learners[key].courseLearner;
                return {
                  ...learner,
                  ...(includeClasses ? { classId: classes[key] } : {}),
                  enrollment: {
                    ...learner.enrollment,
                    courseId: malformedRoster ? randomUUID() : courseId,
                    enrollmentId: enrolledIds[key],
                    enrolledAt:
                      key === 'an'
                        ? anEnrolledAt
                        : learner.enrollment.enrolledAt,
                  },
                };
              });
        return send({
          items: roster.slice((page - 1) * limit, page * limit),
          total: roster.length,
          page,
          limit,
        });
      }
      if (url.pathname === `/api/v1/internal/courses/${courseId}/structure`) {
        if (incoming.headers.authorization !== `Bearer ${token}`)
          return response.writeHead(401).end();
        const version = Number(url.searchParams.get('contentVersion'));
        snapshotRequests.push(version);
        return send(snapshot(wrongSnapshot ? version + 1 : version));
      }
      return response.writeHead(404).end();
    });

    beforeAll(async () => {
      const url = new URL(databaseUrl!);
      if (
        !['127.0.0.1', 'localhost'].includes(url.hostname) ||
        !decodeURIComponent(url.pathname).endsWith('_test')
      )
        throw new Error('Use a local *_test PostgreSQL database');
      source = createLearningDataSource(databaseUrl);
      await source.initialize();
      await source.runMigrations();
      await source.getRepository(CourseSkill).insert(
        [
          { id: skillId, name: 'Tổ chức module' },
          { id: unknownEvidenceSkillId, name: 'Bằng chứng chưa đủ' },
        ].map((skill) => ({
          ...skill,
          courseId,
          description: '',
          status: 'ACTIVE',
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
      );
      await new Promise<void>((resolve, reject) => {
        course.once('error', reject);
        course.listen(0, '127.0.0.1', resolve);
      });
      process.env.NODE_ENV = 'test';
      process.env.MOCK_AUTH = 'true';
      process.env.DATABASE_URL = databaseUrl;
      process.env.COURSE_URL = `http://127.0.0.1:${(course.address() as AddressInfo).port}`;
      process.env.COURSE_SERVICE_TOKEN = token;
      process.env.LEARNING_MASTERY_DEVELOPING_MIN = '40';
      process.env.LEARNING_MASTERY_PROFICIENT_MIN = '70';
      delete process.env.RABBITMQ_URL;
      const testing = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      sync = testing.get(AssessmentAttemptsRepository);
      migrations = testing.get(CourseItemMigrationsRepository);
      app = testing.createNestApplication();
      await app.listen(0, '127.0.0.1');
    }, 20000);

    beforeEach(async () => {
      wrongSnapshot = malformedRoster = false;
      includeClasses = true;
      anEnrolledAt = an.courseLearner.enrollment.enrolledAt;
      anCancelled = false;
      snapshotVariant = 'normal';
      snapshotRequests.length = 0;
      for (const row of fixture.learningRecords.itemCompletions) {
        await source!.getRepository(ItemCompletion).insert({
          ...row,
          status: 'COMPLETED',
          enrollmentId: enrolledIds.an,
          enrolledAt: new Date(legacyEnrollmentStart),
          completedAt: new Date(row.completedAt),
        });
      }
      for (const row of fixture.learningRecords.lessonCompletions) {
        await source!.getRepository(LessonCompletion).insert({
          ...row,
          enrollmentId: enrolledIds.an,
          enrolledAt: new Date(legacyEnrollmentStart),
          completedAt: new Date(row.completedAt),
        });
      }
      for (const row of fixture.learningRecords.resumeCheckpoints) {
        await source!.getRepository(LearningResume).insert({
          ...row,
          enrollmentId: enrolledIds.an,
          enrolledAt: new Date(legacyEnrollmentStart),
          updatedAt: new Date(row.updatedAt),
        });
      }
    });

    afterEach(async () => {
      if (!source?.isInitialized) return;
      for (const enrollmentId of Object.values(enrolledIds)) {
        await source.getRepository(ItemCompletion).delete({ enrollmentId });
        await source.getRepository(LessonCompletion).delete({ enrollmentId });
        await source.getRepository(LearningResume).delete({ enrollmentId });
      }
      await source.getRepository(CourseItemMigration).delete({ courseId });
      await source.getRepository(AssessmentSyncReceipt).delete({ courseId });
      await source.getRepository(AssessmentAttempt).delete({ courseId });
    });

    afterAll(async () => {
      try {
        await app?.close();
        if (course.listening)
          await new Promise<void>((resolve) => course.close(() => resolve()));
        if (source?.isInitialized) {
          await source.getRepository(CourseSkill).delete({ courseId });
          await source.destroy();
        }
      } finally {
        process.env = env;
      }
    });

    function get(
      path: string,
      actor: string | null = fixture.actors.owner,
      id: string = courseId,
    ) {
      const query = request(app!.getHttpServer()).get(
        `/api/v1/learning/courses/${id}/${path}`,
      );
      return actor ? query.set('X-Mock-User', actor) : query;
    }

    async function grade(overrides: Partial<GradedAssessmentSummary>) {
      const gradedAt = overrides.gradedAt ?? v1GradeAt;
      const event = parseContract('AttemptGradedV2Event', {
        ...template,
        eventId: randomUUID(),
        occurredAt: gradedAt,
        payload: {
          ...template.payload,
          quizId,
          ...overrides,
          attemptId: randomUUID(),
          courseId,
          gradedAt,
        },
      });
      expect(await sync.record(event)).toBe('SYNCED');
      return event;
    }

    it('INS-03 uses approved fixture, returns paginated lesson progress and details per enrolled version', async () => {
      const first = await get('learners?page=1&limit=1').expect(200);
      const second = await get(
        'learners?page=2&limit=1',
        fixture.actors.admin,
      ).expect(200);
      const expected = (learner: 'an' | 'binh') => ({
        ...fixture.expectedSummaries[learner],
        progress: {
          ...fixture.expectedSummaries[learner].progress,
          courseId,
          updatedAt: new Date(
            fixture.expectedSummaries[learner].progress.updatedAt,
          ).toISOString(),
        },
      });
      for (const [result, key, page] of [
        [first, 'binh', 1],
        [second, 'an', 2],
      ] as const) {
        const data = (result.body as { data: { items: unknown[] } }).data;
        expect(data).toMatchObject({ total: 2, page, limit: 1 });
        expect(
          parseContract('LearnerProgressSummary', data.items[0]),
        ).toMatchObject(expected(key));
      }
      const detail = await get(`learners/${an.courseLearner.userId}`).expect(
        200,
      );
      expect(
        parseContract(
          'LearnerProgressDetail',
          (detail.body as { data: unknown }).data,
        ),
      ).toEqual({
        ...expected('an'),
        completedLessons: [
          {
            ...lesson,
            completedAt: new Date(lesson.completedAt).toISOString(),
          },
        ],
        lastActivityAt: new Date(
          fixture.proposedDetailFields.an.lastActivityAt,
        ).toISOString(),
      });
      const idle = await get(`learners/${binh.courseLearner.userId}`).expect(
        200,
      );
      expect(idle.body).toMatchObject({
        data: { lastActivityAt: null, completedLessons: [] },
      });
      expect(snapshotRequests).toEqual([2, 1, 1, 2]);
      expect(
        (await get('learners?page=3&limit=1').expect(200)).body,
      ).toMatchObject({ data: { items: [], total: 2 } });
    });

    it('INS-03/06/07/09 enforce course scope and handle invalid provider data', async () => {
      for (const path of [
        'learners',
        `learners/${an.courseLearner.userId}`,
        'statistics',
        'weak-skills',
        'analytics',
      ]) {
        await get(path, null).expect(401);
        await get(path, fixture.actors.learner).expect(403);
        const denied = await get(path, fixture.actors.otherInstructor).expect(
          403,
        );
        expect(denied.body).toMatchObject({
          error: { code: 'NOT_COURSE_OWNER' },
        });
      }
      await get('learners?page=0').expect(400);
      await get(`learners/${fixture.unenrolledUserId}`).expect(404);
      await get(
        'learners',
        fixture.actors.owner,
        fixture.unknownCourseId,
      ).expect(404);
      malformedRoster = true;
      await get('learners').expect(503);
      expect(snapshotRequests).toEqual([]);
      malformedRoster = false;
      wrongSnapshot = true;
      await get(`learners/${an.courseLearner.userId}`).expect(409);
    });

    it('INS-03 keeps the learner activity time when a Course update invalidates a completed lesson', async () => {
      const { appliedAt, policy, targetContentVersion, previousItemId } =
        fixture.recompletionScenario;
      const previous = snapshot(1).outline.chapters[0].lessons[0].items.find(
        ({ id }) => id === previousItemId,
      )!;
      await source!.getRepository(CourseItemMigration).insert({
        revisionId: randomUUID(),
        targetItemId: previous.id,
        policy: policy as 'REQUIRE_RECOMPLETION',
        courseId,
        contentVersion: targetContentVersion,
        generation: 1,
        reason: 'Course revised the video',
        appliedAt: new Date(appliedAt),
        context: {
          item: { ...previous, contentVersion: targetContentVersion },
          previousItems: [previous],
          requiredAssessment: null,
        },
      });
      const result = await get(`learners/${an.courseLearner.userId}`).expect(
        200,
      );
      expect(result.body).toMatchObject({
        data: {
          progress: {
            ...fixture.recompletionScenario.anProgressOverrides,
            updatedAt: new Date(appliedAt).toISOString(),
          },
          ...fixture.recompletionScenario.anProposedDetailFields,
          lastActivityAt: new Date(
            fixture.recompletionScenario.anProposedDetailFields.lastActivityAt,
          ).toISOString(),
        },
      });
      const dashboard = await request(app!.getHttpServer())
        .get('/api/v1/learning/me/dashboard')
        .set('X-Mock-User', an.fixtureUser)
        .expect(200);
      expect(dashboard.body).toMatchObject({
        data: {
          courses: [
            {
              courseId,
              updatedAt: new Date(appliedAt).toISOString(),
              lastActivityAt: new Date(
                fixture.recompletionScenario.anProposedDetailFields
                  .lastActivityAt,
              ).toISOString(),
            },
          ],
        },
      });
    });

    it('INS-03 keeps a prior quiz activity when Course requires a replacement quiz', async () => {
      await grade({});
      const original = snapshot(1);
      const replaced = original.outline.chapters
        .flatMap(({ lessons }) => lessons.flatMap(({ items }) => items))
        .find((item) => item.type === 'QUIZ' && item.quizId === quizId);
      if (replaced?.type !== 'QUIZ') throw new Error('Missing quiz in fixture');
      const assessment = original.completionPolicy.requiredAssessments.find(
        (row) => row.quizId === quizId,
      )!;
      await source!.getRepository(CourseItemMigration).insert({
        revisionId: randomUUID(),
        targetItemId: replaced.id,
        policy: 'REQUIRE_RECOMPLETION',
        courseId,
        contentVersion: 2,
        generation: 1,
        reason: 'Assessment revised',
        appliedAt: new Date('2026-01-15T11:00:00Z'),
        context: {
          item: { ...replaced, contentVersion: 2, assessmentVersion: 2 },
          previousItems: [replaced],
          requiredAssessment: { ...assessment, assessmentVersion: 2 },
        },
      });
      await grade({ assessmentVersion: 99, gradedAt: '2026-01-15T20:00:00Z' });
      const detail = await get(`learners/${an.courseLearner.userId}`).expect(
        200,
      );
      expect(detail.body).toMatchObject({
        data: {
          lastActivityAt: new Date(v1GradeAt).toISOString(),
          progress: { status: 'OUTDATED', passedRequiredAssessments: 0 },
        },
      });
    });

    it('INS-03 uses one database snapshot when Course changes during a report', async () => {
      const previous = snapshot(1).outline.chapters[0].lessons[0].items[0];
      const appliedAt = new Date('2026-01-15T11:00:00Z');
      const readMigrations = migrations.list.bind(migrations);
      const spy = jest
        .spyOn(migrations, 'list')
        .mockImplementationOnce(async (...args) => {
          const rows = await readMigrations(...args);
          await source!.transaction(async (manager) => {
            await manager.getRepository(CourseItemMigration).insert({
              revisionId: randomUUID(),
              targetItemId: previous.id,
              policy: 'REQUIRE_RECOMPLETION',
              courseId,
              contentVersion: 2,
              generation: 1,
              reason: 'Course revised a video',
              appliedAt,
              context: {
                item: { ...previous, contentVersion: 2 },
                previousItems: [previous],
                requiredAssessment: null,
              },
            });
            await manager.getRepository(ItemCompletion).update(
              {
                enrollmentId: enrolledIds.an,
                contentVersion: 1,
                learningItemId: previous.id,
              },
              {
                status: 'OUTDATED',
                invalidatedAt: appliedAt,
                invalidationReason: 'Course revised a video',
              },
            );
          });
          return rows;
        });
      try {
        const path = `learners/${an.courseLearner.userId}`;
        const during = await get(path).expect(200);
        expect(during.body).toMatchObject({
          data: {
            progress: { status: 'IN_PROGRESS', completedRequiredLessons: 1 },
          },
        });
        const after = await get(path).expect(200);
        expect(after.body).toMatchObject({
          data: {
            progress: {
              status: 'OUTDATED',
              completedRequiredLessons: 0,
              updatedAt: appliedAt.toISOString(),
            },
          },
        });
      } finally {
        spy.mockRestore();
      }
    });

    it('INS-06 uses official completion and filters the enrolled cohort with an exclusive upper bound', async () => {
      const reading = snapshot(1).outline.chapters[1].lessons[0];
      await source!.getRepository(ItemCompletion).insert({
        enrollmentId: enrolledIds.an,
        enrolledAt: new Date(anEnrolledAt),
        contentVersion: 1,
        learningItemId: reading.items[0].id,
        completedAt: new Date(v1GradeAt),
      });
      await source!.getRepository(LessonCompletion).insert({
        enrollmentId: enrolledIds.an,
        enrolledAt: new Date(anEnrolledAt),
        contentVersion: 1,
        lessonId: reading.id,
        completedAt: new Date(v1GradeAt),
      });
      await grade({ ...chapterQuiz, quizType: 'GRADED' });
      const beforeFinal = await get('statistics').expect(200);
      expect(beforeFinal.body).toMatchObject({
        data: {
          enrolledCount: 2,
          completedCount: 0,
          completionRatePercent: 0,
          averageProgressPercent: 50,
        },
      });
      await grade({});
      const all = await get('statistics').expect(200);
      expect(
        parseContract(
          'LearningStatisticsData',
          (all.body as { data: unknown }).data,
        ),
      ).toMatchObject({
        enrolledCount: 2,
        completedCount: 1,
        completionRatePercent: 50,
        averageProgressPercent: 50,
      });
      const one = await get(
        'statistics?fromAt=2026-01-15T09:00:00Z&toAt=2026-01-16T09:00:00Z',
      ).expect(200);
      expect(one.body).toMatchObject({
        data: {
          enrolledCount: 1,
          completedCount: 1,
          completionRatePercent: 100,
        },
      });
      const empty = await get(
        'statistics',
        fixture.actors.owner,
        fixture.emptyCourse.id,
      ).expect(200);
      expect(empty.body).toMatchObject({
        data: {
          enrolledCount: 0,
          completedCount: 0,
          completionRatePercent: null,
          averageProgressPercent: null,
        },
      });
      await get(
        'statistics?fromAt=2026-02-01T00:00:00Z&toAt=2026-01-01T00:00:00Z',
      ).expect(400);
    });

    it('INS-07 counts each learner once and excludes insufficient evidence from the rate', async () => {
      const before = await get('weak-skills').expect(200);
      expect(before.body).toMatchObject({
        data: { enrolledCount: 2, skills: [] },
      });
      const weak = { skillId, score: 3, maxScore: 10, questionCount: 5 };
      await grade({
        score: 3,
        maxScore: 10,
        passed: false,
        skillScores: [
          weak,
          { skillId: unknownEvidenceSkillId, score: 1, maxScore: 10 },
        ],
      });
      await grade({
        score: 3,
        maxScore: 10,
        passed: false,
        skillScores: [weak],
      });
      await grade({
        userId: binh.courseLearner.userId,
        assessmentVersion: 2,
        gradedAt: v2GradeAt,
        skillScores: [{ skillId, score: 9, maxScore: 10, questionCount: 5 }],
      });
      const result = await get('weak-skills').expect(200);
      expect(
        parseContract(
          'LearningWeakSkillsData',
          (result.body as { data: unknown }).data,
        ),
      ).toMatchObject({
        enrolledCount: 2,
        skills: [
          {
            skillId,
            assessedLearnerCount: 2,
            weakLearnerCount: 1,
            weakRatePercent: 50,
          },
        ],
      });
    });

    it('INS-09 separates quiz versions and applies class, quiz and activity date filters', async () => {
      await grade({ score: 3, maxScore: 10, passed: false });
      await grade({ quizType: 'PRACTICE' });
      await grade({
        userId: binh.courseLearner.userId,
        assessmentVersion: 2,
        gradedAt: v2GradeAt,
        score: 9,
        maxScore: 10,
      });
      const all = await get('analytics').expect(200);
      const data = parseContract(
        'LearningAnalyticsData',
        (all.body as { data: unknown }).data,
      );
      expect(data).toMatchObject({
        enrolledCount: 2,
        lessonProgressTrend: [{ day: '2026-01-15', completedLessons: 1 }],
      });
      expect(data.lessonProgressDistribution.map(({ count }) => count)).toEqual(
        [1, 0, 1, 0],
      );
      expect(
        data.quizScores.map(({ assessmentVersion, gradedAttempts }) => [
          assessmentVersion,
          gradedAttempts,
        ]),
      ).toEqual([
        [1, 1],
        [2, 1],
      ]);
      const filtered = await get(
        `analytics?classId=${binhClass}&quizId=${quizId}&assessmentVersion=2&fromAt=${v2GradeAt}`,
      ).expect(200);
      expect(filtered.body).toMatchObject({
        data: {
          enrolledCount: 1,
          lessonProgressTrend: [],
          quizScores: [
            {
              quizId,
              assessmentVersion: 2,
              gradedAttempts: 1,
              trend: [{ day: '2026-01-16', averageScorePercent: 90 }],
            },
          ],
        },
      });
      const boundary = await get(
        `analytics?quizId=${quizId}&toAt=${v2GradeAt}`,
      ).expect(200);
      expect(
        (boundary.body as { data: { quizScores: unknown[] } }).data.quizScores,
      ).toHaveLength(1);
      await get('analytics?assessmentVersion=2').expect(400);
      includeClasses = false;
      await get(`analytics?classId=${anClass}`).expect(503);
    });

    it('INS reports agree with student APIs after lesson completion, quiz sync and replay', async () => {
      const reading = snapshot(1).outline.chapters[1].lessons[0];
      const complete = (target: 'items' | 'lessons', id: string) =>
        request(app!.getHttpServer())
          .put(`/api/v1/learning/${target}/${id}/completion`)
          .set('X-Mock-User', an.fixtureUser)
          .send({ completed: true, contentVersion: 1 });

      const initial = await get('progress', an.fixtureUser).expect(200);
      expect(initial.body).toMatchObject({
        data: { lessonProgressPercent: 50, status: 'IN_PROGRESS' },
      });
      const firstGrade = await grade({
        score: 3,
        maxScore: 10,
        passed: false,
        skillScores: [{ skillId, score: 3, maxScore: 10, questionCount: 5 }],
      });
      expect(await sync.record(firstGrade)).toBe('SYNCED');
      await grade({ ...chapterQuiz, quizType: 'GRADED' });
      await complete('items', reading.items[0].id).expect(200);
      await complete('lessons', reading.id).expect(200);
      const incomplete = await get('statistics').expect(200);
      expect(incomplete.body).toMatchObject({ data: { completedCount: 0 } });

      await grade({ score: 17, maxScore: 20, passed: true });
      const [student, list, detail, stats, mastery, weak, charts] =
        await Promise.all([
          get('progress', an.fixtureUser).expect(200),
          get('learners').expect(200),
          get(`learners/${an.courseLearner.userId}`).expect(200),
          get('statistics').expect(200),
          get('mastery', an.fixtureUser).expect(200),
          get('weak-skills').expect(200),
          get(`analytics?quizId=${quizId}`).expect(200),
        ]);
      expect(student.body).toMatchObject({
        data: { lessonProgressPercent: 100, status: 'COMPLETED' },
      });
      const {
        enrollmentId: _enrollmentId,
        userId,
        ...progress
      } = parseContract(
        'CourseProgressData',
        (student.body as { data: unknown }).data,
      );
      expect(list.body).toMatchObject({
        data: {
          items: expect.arrayContaining([
            expect.objectContaining({
              userId,
              progress,
            }),
          ]),
        },
      });
      expect(detail.body).toMatchObject({
        data: {
          completedLessons: [
            { lessonId: lesson.lessonId },
            { lessonId: reading.id },
          ],
          lastActivityAt: expect.any(String),
        },
      });
      expect(stats.body).toMatchObject({
        data: {
          enrolledCount: 2,
          completedCount: 1,
          completionRatePercent: 50,
        },
      });
      expect(mastery.body).toMatchObject({
        data: {
          skills: [
            expect.objectContaining({
              skillId,
              scorePercent: 30,
              level: 'BEGINNER',
            }),
          ],
        },
      });
      expect(weak.body).toMatchObject({
        data: {
          skills: [{ skillId, weakLearnerCount: 1, assessedLearnerCount: 1 }],
        },
      });
      expect(charts.body).toMatchObject({
        data: {
          quizScores: [
            {
              gradedAttempts: 2,
              scoreDistribution: [
                { count: 0 },
                { count: 1 },
                { count: 0 },
                { count: 1 },
              ],
              trend: [{ day: '2026-01-15', averageScorePercent: 57.5 }],
            },
          ],
        },
      });
    });

    it('PRG-01/02/05/08 and INS-03 separate re-enrollments with the same ID and contentVersion', async () => {
      const originalStart = new Date(anEnrolledAt);
      const video = fixture.learningRecords.itemCompletions[0];
      const http = () => request(app!.getHttpServer());
      const learner = an.fixtureUser;
      const setCompletion = (type: 'items' | 'lessons', id: string) =>
        http()
          .put(`/api/v1/learning/${type}/${id}/completion`)
          .set('X-Mock-User', learner)
          .send({ completed: true, contentVersion: 1 });
      const saveResume = (positionSeconds: number, expectedRevision: number) =>
        http()
          .put(`/api/v1/learning/courses/${courseId}/resume`)
          .set('X-Mock-User', learner)
          .send({
            contentVersion: 1,
            lessonId: lesson.lessonId,
            learningItemId: video.learningItemId,
            positionSeconds,
            expectedRevision,
          });

      const original = await get('progress', learner).expect(200);
      expect(original.body).toMatchObject({
        data: {
          enrollmentId: enrolledIds.an,
          contentVersion: 1,
          completedRequiredLessons: 1,
        },
      });
      expect((await get('resume', learner).expect(200)).body).toMatchObject({
        data: { revision: 1, positionSeconds: 30 },
      });
      const repeated = await setCompletion(
        'items',
        video.learningItemId,
      ).expect(200);
      expect(repeated.body).toMatchObject({
        data: { completedAt: new Date(video.completedAt).toISOString() },
      });
      await setCompletion('lessons', lesson.lessonId).expect(200);
      await saveResume(45, 1).expect(200);

      anCancelled = true;
      await get('progress', learner).expect(403);
      await get(`learners/${an.courseLearner.userId}`).expect(404);
      const [{ now }] = await source!.query<{ now: Date }[]>(
        'SELECT clock_timestamp() AS now',
      );
      anEnrolledAt = now.toISOString();
      anCancelled = false;
      const fresh = await get('progress', learner).expect(200);
      expect(fresh.body).toMatchObject({
        data: {
          enrollmentId: enrolledIds.an,
          contentVersion: 1,
          status: 'NOT_STARTED',
          completedRequiredLessons: 0,
        },
      });
      expect((await get('resume', learner).expect(200)).body).toMatchObject({
        data: null,
      });
      expect(
        (await get(`learners/${an.courseLearner.userId}`).expect(200)).body,
      ).toMatchObject({ data: { completedLessons: [], lastActivityAt: null } });
      await saveResume(60, 2).expect(409);
      const checkpoint = await saveResume(60, 0).expect(200);
      await saveResume(85, 1).expect(409);
      await saveResume(85, 2).expect(409);
      expect(checkpoint.body).toMatchObject({
        data: { positionSeconds: 60, revision: 3 },
      });
      const updatedCheckpoint = await saveResume(65, 3).expect(200);
      expect(updatedCheckpoint.body).toMatchObject({
        data: { positionSeconds: 65, revision: 4 },
      });
      await setCompletion('items', video.learningItemId).expect(200);
      await setCompletion('lessons', lesson.lessonId).expect(200);

      const storageScope = { enrollmentId: enrolledIds.an, contentVersion: 1 };
      expect(
        await source!.getRepository(ItemCompletion).countBy(storageScope),
      ).toBe(2);
      expect(
        await source!.getRepository(LessonCompletion).countBy(storageScope),
      ).toBe(2);
      const checkpoints = await source!.getRepository(LearningResume).find({
        where: storageScope,
        order: { enrolledAt: 'ASC' },
      });
      expect(checkpoints).toMatchObject([
        { enrolledAt: originalStart, positionSeconds: 45, revision: 2 },
        { enrolledAt: now, positionSeconds: 65, revision: 4 },
      ]);
    });

    it('PRG excludes legacy lessons and checkpoints earlier than the current enrollment', async () => {
      anEnrolledAt = '2026-01-15T09:30:00Z';
      const result = await get('progress', an.fixtureUser).expect(200);
      expect(result.body).toMatchObject({
        data: {
          status: 'NOT_STARTED',
          completedRequiredItems: 0,
          completedRequiredLessons: 0,
        },
      });
      expect(
        (await get('resume', an.fixtureUser).expect(200)).body,
      ).toMatchObject({ data: null });
      expect(
        await source!
          .getRepository(LessonCompletion)
          .countBy({ enrollmentId: enrolledIds.an }),
      ).toBe(1);
    });

    it('INS-07 and INS-09 count the same grade when Course sends uppercase quiz UUIDs', async () => {
      snapshotVariant = 'uppercase-quiz';
      await grade({
        skillScores: [{ skillId, score: 1, maxScore: 10, questionCount: 5 }],
      });
      const weak = await get('weak-skills').expect(200);
      expect(weak.body).toMatchObject({
        data: { skills: [{ skillId, weakLearnerCount: 1 }] },
      });
      const charts = await get(
        `analytics?quizId=${quizId.toUpperCase()}`,
      ).expect(200);
      expect(charts.body).toMatchObject({
        data: { quizScores: [{ quizId, gradedAttempts: 1 }] },
      });
    });

    it.each(['foreign-item', 'wrong-item-version'] as const)(
      'INS rejects nested snapshot data from another course or version (%s)',
      async (variant) => {
        snapshotVariant = variant;
        for (const path of [
          'learners',
          `learners/${an.courseLearner.userId}`,
          'statistics',
          'weak-skills',
          'analytics',
        ])
          await get(path).expect(503);
      },
    );
  },
);
