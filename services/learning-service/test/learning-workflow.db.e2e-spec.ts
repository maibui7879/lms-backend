import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ATTEMPT_GRADED_V2_ROUTING_KEY, parseContract } from '@lms/contracts';
import type { AttemptGradedV2Event } from '@lms/contracts';
import { connect } from 'amqplib';
import type { ChannelModel, ConfirmChannel } from 'amqplib';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { CourseSkill } from '../src/modules/mastery/entities/course-skill.entity';
import { MasteryCurrent } from '../src/modules/mastery/entities/mastery-current.entity';
import { MasterySnapshot } from '../src/modules/mastery/entities/mastery-snapshot.entity';
import { createLearningDataSource } from '../src/database/learning-database';
import { AssessmentAttempt } from '../src/modules/progress-sync/entities/assessment-attempt.entity';
import { AssessmentSyncReceipt } from '../src/modules/progress-sync/entities/assessment-sync-receipt.entity';
import { AssessmentAttemptsRepository } from '../src/modules/progress-sync/repositories/assessment-attempts.repository';
import { ItemCompletion } from '../src/modules/progress/entities/item-completion.entity';
import { LearningResume } from '../src/modules/progress/entities/learning-resume.entity';
import { LessonCompletion } from '../src/modules/progress/entities/lesson-completion.entity';
import providers from './fixtures/learning-providers.mock.json';
import masteryFixture from './fixtures/mastery.mock.json';
import scenarios from './fixtures/learning-scenarios.mock.json';

const databaseUrl = process.env.TEST_DATABASE_URL;
const brokerUrl = process.env.TEST_RABBITMQ_URL;
const suite = databaseUrl && brokerUrl ? describe : describe.skip;
const exchange = 'lms.events';
const queue = 'learning.quiz-results.v2';
const dlq = `${queue}.dlq`;
const serviceToken = 'fixture-quiz-service-token';
const courseServiceToken = 'fixture-course-service-token';
const learner = 'studentB';

async function waitFor<T>(
  read: () => Promise<T | undefined>,
  label: string,
  timeout = 8000,
): Promise<T> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await read();
    if (value !== undefined) return value;
    await delay(50);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function listen(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
): Promise<Server> {
  const server = createServer(handler);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return server;
}

suite(
  'Learning progress and quiz sync workflow with PostgreSQL and RabbitMQ',
  () => {
    let app: INestApplication<App> | undefined;
    let source: DataSource | undefined;
    let broker: ChannelModel | undefined;
    let publisher: ConfirmChannel;
    let course: Server | undefined;
    let quiz: Server | undefined;
    const oldEnv = { ...process.env };
    const enrollment = parseContract('EnrollmentSnapshotData', {
      ...providers.course.enrollment,
      enrollmentId: randomUUID(),
    });
    const structure = parseContract(
      'CourseLearningStructure',
      providers.course.structure,
    );
    const courseData = parseContract(
      'CourseData',
      providers.course.publishedCourse,
    );
    const { courseId, userId, contentVersion } = enrollment;
    const coursePath = `/api/v1/courses/${courseId}`;
    const learningPath = `/api/v1/learning/courses/${courseId}`;
    const scoreCourse = { ...courseData, id: randomUUID() };
    const masterySkillId = randomUUID();
    const scoreEnrollment = {
      ...enrollment,
      courseId: scoreCourse.id,
      enrollmentId: randomUUID(),
    };
    const resumeEnrollment = { ...enrollment, enrollmentId: randomUUID() };
    const secondCoursePolicy = {
      ...structure.completionPolicy,
      courseId: scoreCourse.id,
      requiredItemIds: [],
      chapterPolicies: [],
    };
    const [chapterOne, chapterTwo] = structure.outline.chapters;
    const [firstLesson] = chapterOne.lessons;
    const [secondLesson] = chapterTwo.lessons;
    const [video, optionalReading] = firstLesson.items;
    const [reading] = secondLesson.items;
    const attempts = new Map<string, AttemptGradedV2Event>();
    const events = new Set<string>();
    const masteryEvents = new Set<string>();
    let enrollmentActive = false;
    let currentEnrollment = enrollment;
    let scoreEnrollmentActive = false;
    let outlineVersion = contentVersion;
    let oldSnapshotAvailable = true;
    let publishedVersion = contentVersion;

    function makeEvent(fixture: unknown): AttemptGradedV2Event {
      const original = parseContract('AttemptGradedV2Event', fixture);
      const event = {
        ...original,
        eventId: randomUUID(),
        payload: { ...original.payload, attemptId: randomUUID() },
      };
      events.add(event.eventId);
      attempts.set(event.payload.attemptId, event);
      return event;
    }

    function json(res: ServerResponse, data: unknown) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data }));
    }

    beforeAll(async () => {
      const database = new URL(databaseUrl!);
      const rabbit = new URL(brokerUrl!);
      if (
        ![database, rabbit].every(
          (url) =>
            ['127.0.0.1', 'localhost'].includes(url.hostname) &&
            decodeURIComponent(url.pathname).endsWith('_test'),
        )
      ) {
        throw new Error(
          'Use a local *_test PostgreSQL database and a local *_test RabbitMQ vhost',
        );
      }
      source = createLearningDataSource(databaseUrl);
      await source.initialize();
      await source.runMigrations();
      course = await listen((req, res) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        if (url.pathname === `/api/v1/internal/courses/${courseId}/structure`) {
          if (req.headers.authorization !== `Bearer ${courseServiceToken}`)
            return res.writeHead(401).end();
          if (
            !oldSnapshotAvailable ||
            url.searchParams.get('contentVersion') !== String(contentVersion)
          )
            return res.writeHead(409).end();
          return json(res, {
            ...structure,
            outline: { ...structure.outline, contentVersion: outlineVersion },
          });
        }
        if (url.pathname === '/api/v1/enrollments/me') {
          const progressEnrollment =
            enrollmentActive && req.headers['x-mock-user'] === learner
              ? [
                  {
                    enrollment: currentEnrollment,
                    course: { ...courseData, contentVersion: publishedVersion },
                  },
                ]
              : [];
          const scoreEnrollments =
            scoreEnrollmentActive && req.headers['x-mock-user'] === learner
              ? [{ enrollment: scoreEnrollment, course: scoreCourse }]
              : [];
          const items = [...progressEnrollment, ...scoreEnrollments];
          return json(res, {
            items,
            page: Number(url.searchParams.get('page')),
            limit: Number(url.searchParams.get('limit')),
            total: items.length,
          });
        }
        if (url.pathname === `/api/v1/courses/${scoreCourse.id}`)
          return json(res, scoreCourse);
        if (
          url.pathname ===
          `/api/v1/internal/courses/${scoreCourse.id}/structure`
        ) {
          if (req.headers.authorization !== `Bearer ${courseServiceToken}`)
            return res.writeHead(401).end();
          if (url.searchParams.get('contentVersion') !== String(contentVersion))
            return res.writeHead(409).end();
          return json(res, {
            outline: {
              ...structure.outline,
              courseId: scoreCourse.id,
              chapters: [],
            },
            completionPolicy: secondCoursePolicy,
          });
        }
        if (url.pathname === coursePath) return json(res, courseData);
        res.writeHead(404).end();
      });
      quiz = await listen((req, res) => {
        if (req.headers.authorization !== `Bearer ${serviceToken}`) {
          res.writeHead(401).end();
          return;
        }
        const match = /^\/api\/v1\/internal\/attempts\/([^/]+)\/access$/.exec(
          req.url ?? '',
        );
        const event = match && attempts.get(match[1]);
        if (!event) {
          res.writeHead(404).end();
          return;
        }
        json(
          res,
          parseContract('AttemptAccessData', {
            attemptId: event.payload.attemptId,
            userId: event.payload.userId,
            courseId: event.payload.courseId,
            eventId: event.eventId,
            attemptStatus: 'SUBMITTED',
            gradingStatus: 'GRADED',
          }),
        );
      });

      process.env.NODE_ENV = 'test';
      process.env.MOCK_AUTH = 'true';
      process.env.DATABASE_URL = databaseUrl;
      process.env.RABBITMQ_URL = brokerUrl;
      process.env.COURSE_URL = `http://127.0.0.1:${(course.address() as AddressInfo).port}`;
      process.env.COURSE_SERVICE_TOKEN = courseServiceToken;
      process.env.QUIZ_URL = `http://127.0.0.1:${(quiz.address() as AddressInfo).port}`;
      process.env.QUIZ_SERVICE_TOKEN = serviceToken;
      process.env.LEARNING_MASTERY_DEVELOPING_MIN = '40';
      process.env.LEARNING_MASTERY_PROFICIENT_MIN = '70';
      const testing = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      app = testing.createNestApplication();
      await app.init();
      broker = await connect(brokerUrl!);
      publisher = await broker.createConfirmChannel();
      await waitFor(
        async () =>
          (await publisher.assertQueue(queue, { durable: true })).consumerCount
            ? true
            : undefined,
        'Learning consumer',
      );
    }, 20000);

    afterEach(async () => {
      scoreEnrollmentActive = false;
      if (masteryEvents.size && source?.isInitialized) {
        for (const eventId of masteryEvents) {
          await source.getRepository(AssessmentSyncReceipt).delete({ eventId });
          await source.getRepository(AssessmentAttempt).delete({ eventId });
        }
        masteryEvents.clear();
        await source
          .getRepository(MasteryCurrent)
          .delete({ enrollmentId: scoreEnrollment.enrollmentId });
      }
    });

    afterAll(async () => {
      await app?.close();
      await broker?.close();
      for (const server of [course, quiz]) {
        if (server?.listening)
          await new Promise<void>((resolve) => server.close(() => resolve()));
      }
      if (source?.isInitialized) {
        await source.getRepository(CourseSkill).delete({ id: masterySkillId });
        for (const eventId of events) {
          await source.getRepository(AssessmentSyncReceipt).delete({ eventId });
          await source.getRepository(AssessmentAttempt).delete({ eventId });
        }
        await source
          .getRepository(ItemCompletion)
          .delete({ enrollmentId: enrollment.enrollmentId });
        await source
          .getRepository(ItemCompletion)
          .delete({ enrollmentId: resumeEnrollment.enrollmentId });
        await source
          .getRepository(LessonCompletion)
          .delete({ enrollmentId: enrollment.enrollmentId });
        await source
          .getRepository(LearningResume)
          .delete({ enrollmentId: resumeEnrollment.enrollmentId });
        await source.destroy();
      }
      process.env = oldEnv;
    });

    function progress(student = learner) {
      return request(app!.getHttpServer())
        .get(`${learningPath}/progress`)
        .set('X-Mock-User', student);
    }

    function dashboard(student = learner) {
      return request(app!.getHttpServer())
        .get('/api/v1/learning/me/dashboard')
        .set('X-Mock-User', student);
    }

    async function dashboardData(student = learner) {
      return parseContract(
        'LearningDashboardData',
        (await dashboard(student).expect(200)).body.data,
      );
    }

    function complete(itemId: string, version = contentVersion) {
      return request(app!.getHttpServer())
        .put(`/api/v1/learning/items/${itemId}/completion`)
        .set('X-Mock-User', learner)
        .send({ completed: true, contentVersion: version });
    }

    function lessonProgress(lessonId: string, student = learner) {
      return request(app!.getHttpServer())
        .get(`/api/v1/learning/lessons/${lessonId}/progress`)
        .set('X-Mock-User', student);
    }

    function completeLesson(lessonId: string, version = contentVersion) {
      return request(app!.getHttpServer())
        .put(`/api/v1/learning/lessons/${lessonId}/completion`)
        .set('X-Mock-User', learner)
        .send({ completed: true, contentVersion: version });
    }

    async function chapterAccess() {
      const result = await request(app!.getHttpServer())
        .get(`${learningPath}/chapters/access`)
        .set('X-Mock-User', learner)
        .expect(200);
      return parseContract('CourseChapterAccessData', result.body.data)
        .chapters;
    }

    function sync(event: AttemptGradedV2Event, student = learner) {
      return request(app!.getHttpServer())
        .get(`/api/v1/learning/attempts/${event.payload.attemptId}/sync`)
        .set('X-Mock-User', student);
    }

    async function publish(event: AttemptGradedV2Event) {
      publisher.publish(
        exchange,
        ATTEMPT_GRADED_V2_ROUTING_KEY,
        Buffer.from(JSON.stringify(event)),
        { persistent: true },
      );
      await publisher.waitForConfirms();
    }

    async function syncStatus(
      event: AttemptGradedV2Event,
      status: 'PENDING' | 'SYNCED' | 'FAILED',
      student = learner,
    ) {
      return waitFor(async () => {
        const result = await sync(event, student).expect(200);
        const data = parseContract('ProgressSyncData', result.body.data);
        return data.status === status ? data : undefined;
      }, status);
    }

    it('MST-03/05/06/07 weights valid RabbitMQ results by max score and pages history in grade order', async () => {
      scoreEnrollmentActive = true;
      const path = `/api/v1/learning/courses/${scoreCourse.id}/mastery`;
      const get = (url = path, actor = learner) =>
        request(app!.getHttpServer()).get(url).set('X-Mock-User', actor);
      const current = async () =>
        parseContract('MasteryData', (await get().expect(200)).body.data);
      await source!.getRepository(CourseSkill).insert({
        id: masterySkillId,
        courseId: scoreCourse.id,
        name: 'Tổ chức module',
        description: 'Fixture question mapping',
        status: 'ACTIVE',
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      expect((await current()).skills).toEqual([]);
      expect((await get(`${path}/history`).expect(200)).body.data.total).toBe(
        0,
      );
      await get(path, 'studentA').expect(403);
      await get(`${path}?userId=${providers.identity.studentA.id}`).expect(400);
      await get(`${path}/history`, 'studentA').expect(403);
      await get(`${path}/history?userId=${userId}`).expect(400);
      await get(`${path}/history?page=1&page=2`).expect(400);

      const original = providers.quiz.attemptGraded;
      function attempt(
        score: number,
        gradedAt: string,
        extras = {},
        maxScore = 10,
        questionCount?: number,
      ) {
        const event = makeEvent({
          ...original,
          payload: {
            ...original.payload,
            courseId: scoreCourse.id,
            gradedAt,
            score,
            maxScore,
            passed:
              (score / maxScore) * 100 >= original.payload.passingScorePercent,
            skillScores: [
              { skillId: masterySkillId, score, maxScore, questionCount },
            ],
            ...extras,
          },
        });
        masteryEvents.add(event.eventId);
        return event;
      }
      const [early, late] = masteryFixture.attempts.map(
        ({ score, maxScore, gradedAt, questionCount }) =>
          attempt(score, gradedAt, {}, maxScore, questionCount),
      );
      await publish(late);
      await syncStatus(late, 'SYNCED');
      const initialReport = await current();
      expect(initialReport.skills).toEqual([
        {
          skillId: masterySkillId,
          skillName: 'Tổ chức module',
          scorePercent: 90,
          evidenceCount: 1,
          level: 'PROFICIENT',
          questionCount: 5,
        },
      ]);
      const [historyRead, concurrentRead] = await Promise.all([
        get(`${path}/history`).expect(200),
        get(`${path}/history`).expect(200),
      ]);
      const initialHistory = historyRead.body.data;
      expect(concurrentRead.body.data).toEqual(initialHistory);
      const savedLate = parseContract(
        'MasteryHistoryPoint',
        initialHistory.items[0],
      );
      expect(savedLate.recordedAt).toBeDefined();
      await source!
        .getRepository(CourseSkill)
        .update({ id: masterySkillId }, { name: 'Module và provider' });
      await publish(early);
      await syncStatus(early, 'SYNCED');
      const reportAfterEarly = await current();
      expect(Date.parse(reportAfterEarly.updatedAt)).toBeGreaterThan(
        Date.parse(initialReport.updatedAt),
      );
      const duplicate = { ...late, eventId: randomUUID() };
      events.add(duplicate.eventId);
      masteryEvents.add(duplicate.eventId);
      attempts.set(duplicate.payload.attemptId, duplicate);
      await publish(duplicate);
      await syncStatus(duplicate, 'SYNCED');
      for (const extra of [
        attempt(10, '2026-01-15T10:20:00Z', { assessmentVersion: 99 }),
        attempt(10, '2026-01-15T10:21:00Z', { quizType: 'PRACTICE' }),
        attempt(10, '2026-01-15T10:22:00Z', {
          userId: providers.identity.studentA.id,
        }),
        attempt(10, '2026-01-15T10:23:00Z', { skillScores: [] }),
        attempt(10, '2026-01-15T10:24:00Z', {
          skillScores: [{ skillId: randomUUID(), score: 10, maxScore: 10 }],
        }),
      ]) {
        await publish(extra);
        await waitFor(
          async () =>
            (
              await source!
                .getRepository(AssessmentSyncReceipt)
                .findOneBy({ eventId: extra.eventId })
            )?.status === 'SYNCED'
              ? true
              : undefined,
          'filtered mastery attempt committed',
        );
      }
      const report = await current();
      expect(report).toEqual(reportAfterEarly);
      expect(report.skills[0]).toMatchObject({
        scorePercent: expect.closeTo(73.333333, 6),
        evidenceCount: 2,
        questionCount: 8,
        skillName: 'Module và provider',
        level: 'PROFICIENT',
      });
      expect(report.algorithmVersion).toBe(masteryFixture.algorithmVersion);
      const history = async (page: number) => {
        const { data } = (
          await get(`${path}/history?page=${page}&limit=1`).expect(200)
        ).body;
        return {
          total: data.total,
          items: (data.items as unknown[]).map((item) =>
            parseContract('MasteryHistoryPoint', item),
          ),
        };
      };
      const first = await history(1);
      const second = await history(2);
      expect(first.total).toBe(2);
      expect(first.items[0]).toEqual(savedLate);
      expect(second.items[0]).toMatchObject({
        attemptId: early.payload.attemptId,
        skills: [
          {
            scorePercent: 40,
            evidenceCount: 1,
            level: 'DEVELOPING',
            questionCount: 3,
          },
        ],
      });
      const stored = await source!
        .getRepository(MasteryCurrent)
        .findOneByOrFail({
          enrollmentId: scoreEnrollment.enrollmentId,
        });
      expect(stored.data).toEqual(report);
      const storedPoints = await source!.getRepository(MasterySnapshot).findBy({
        enrollmentId: scoreEnrollment.enrollmentId,
      });
      expect(storedPoints).toHaveLength(2);
      expect(
        storedPoints.find(
          ({ attemptId }) => attemptId === late.payload.attemptId,
        )?.data,
      ).toEqual(savedLate);
      expect((await history(3)).items).toEqual([]);

      const decimalSkillId = randomUUID();
      await source!.getRepository(CourseSkill).insert({
        id: decimalSkillId,
        courseId: scoreCourse.id,
        name: 'Điểm thập phân',
        description: '',
        status: 'ACTIVE',
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      try {
        for (const [index, score] of [0.03, 0.29].entries()) {
          const event = attempt(10, `2026-01-15T10:3${index}:00Z`, {
            skillScores: [
              {
                skillId: decimalSkillId,
                score,
                maxScore: 0.4,
                ...(index === 0 ? { questionCount: 2 } : {}),
              },
            ],
          });
          await publish(event);
          await syncStatus(event, 'SYNCED');
        }
        const decimalSkill = (await current()).skills.find(
          ({ skillId }) => skillId === decimalSkillId,
        );
        expect(decimalSkill).toMatchObject({
          scorePercent: expect.closeTo(40, 10),
          level: 'DEVELOPING',
          evidenceCount: 2,
          questionCount: null,
        });
      } finally {
        await source!.getRepository(CourseSkill).delete({ id: decimalSkillId });
      }
    }, 25000);

    it('PRG-04 summarizes synced grades by learner, quiz and version with scoped access', async () => {
      scoreEnrollmentActive = true;
      const ownPath = `/api/v1/learning/courses/${scoreCourse.id}/me/quiz-scores`;
      const ownerPath = `/api/v1/learning/courses/${scoreCourse.id}/quiz-scores`;
      const scores = (path: string, user: string) =>
        request(app!.getHttpServer())
          .get(path)
          .set('X-Mock-User', user)
          .set('X-Request-Id', 'prg04-workflow');
      const mine = () => scores(ownPath, learner);

      const empty = await mine()
        .expect(200)
        .expect('X-Request-Id', 'prg04-workflow');
      expect(empty.body).toEqual({
        data: { items: [], total: 0, page: 1, limit: 20 },
        meta: { requestId: 'prg04-workflow' },
      });
      expect(
        (await scores(ownPath, 'studentA').expect(403)).body.error.code,
      ).toBe('ENROLLMENT_REQUIRED');
      expect(
        (await scores(ownerPath, 'instructorB').expect(403)).body.error.code,
      ).toBe('NOT_COURSE_OWNER');
      expect(
        (await scores(ownerPath, learner).expect(403)).body.error.code,
      ).toBe('FORBIDDEN');
      await scores(`${ownPath}?page=1&page=2`, learner).expect(400);
      await scores(`${ownPath}?limit=101`, learner).expect(400);
      await scores(`${ownPath}?userId=${userId}`, learner).expect(400);

      const failedFixture = providers.quiz.chapterAttempt79;
      const passedFixture = providers.quiz.chapterAttempt80;
      const failed = makeEvent({
        ...failedFixture,
        payload: { ...failedFixture.payload, courseId: scoreCourse.id },
      });
      const passed = makeEvent({
        ...passedFixture,
        payload: {
          ...passedFixture.payload,
          courseId: scoreCourse.id,
          score: 8,
          maxScore: 10,
        },
      });
      expect((await mine().expect(200)).body.data.total).toBe(0);

      await publish(failed);
      await syncStatus(failed, 'SYNCED');
      const first = {
        userId,
        courseId: scoreCourse.id,
        quizId: failed.payload.quizId,
        assessmentVersion: failed.payload.assessmentVersion,
        gradedAttempts: 1,
        bestScorePercent: 79,
        passed: false,
      };
      expect((await mine().expect(200)).body.data.items).toEqual([first]);

      await publish(passed);
      await syncStatus(passed, 'SYNCED');
      const duplicate = { ...passed, eventId: randomUUID() };
      events.add(duplicate.eventId);
      attempts.set(passed.payload.attemptId, duplicate);
      await publish(duplicate);
      await syncStatus(duplicate, 'SYNCED');

      const nextVersion = makeEvent({
        ...failed,
        payload: {
          ...failed.payload,
          assessmentVersion: first.assessmentVersion + 1,
        },
      });
      const practice = makeEvent({
        ...passed,
        payload: { ...passed.payload, quizType: 'PRACTICE', score: 10 },
      });
      const beforeEnrollment = makeEvent({
        ...passed,
        payload: {
          ...passed.payload,
          gradedAt: '2026-01-15T08:59:00Z',
          score: 9,
        },
      });
      const otherLearnerId = providers.identity.studentA.id;
      const otherLearner = makeEvent({
        ...passed,
        payload: { ...passed.payload, userId: otherLearnerId, score: 9.5 },
      });
      for (const event of [
        nextVersion,
        practice,
        beforeEnrollment,
        otherLearner,
      ]) {
        await publish(event);
        await syncStatus(
          event,
          'SYNCED',
          event === otherLearner ? 'studentA' : learner,
        );
      }

      const second = {
        ...first,
        assessmentVersion: first.assessmentVersion + 1,
      };
      const myFirst = {
        ...first,
        gradedAttempts: 2,
        bestScorePercent: 80,
        passed: true,
      };
      expect((await mine().expect(200)).body.data).toEqual({
        items: [myFirst, second],
        total: 2,
        page: 1,
        limit: 20,
      });
      expect(
        (await scores(`${ownPath}?page=2&limit=1`, learner).expect(200)).body
          .data,
      ).toEqual({
        items: [second],
        total: 2,
        page: 2,
        limit: 1,
      });
      expect(
        (await scores(`${ownPath}?page=3&limit=1`, learner).expect(200)).body
          .data,
      ).toEqual({
        items: [],
        total: 2,
        page: 3,
        limit: 1,
      });

      const ownerScores = (await scores(ownerPath, 'instructorA').expect(200))
        .body.data;
      expect(ownerScores.total).toBe(3);
      expect(ownerScores.items).toEqual([
        { ...myFirst, gradedAttempts: 3, bestScorePercent: 90 },
        second,
        {
          ...myFirst,
          userId: otherLearnerId,
          gradedAttempts: 1,
          bestScorePercent: 95,
        },
      ]);
      expect((await scores(ownerPath, 'adminA').expect(200)).body.data).toEqual(
        ownerScores,
      );
    }, 25000);

    it('PRG-06/07 handles concurrent duplicate grades and preserves the original result on conflict', async () => {
      const event = makeEvent({
        ...providers.quiz.attemptGraded,
        payload: {
          ...providers.quiz.attemptGraded.payload,
          courseId: randomUUID(),
        },
      });
      const duplicate = { ...event, eventId: randomUUID() };
      events.add(duplicate.eventId);
      const repository = app!.get(AssessmentAttemptsRepository);
      const results = await Promise.all([
        repository.record(event),
        repository.record(duplicate),
      ]);
      expect(results).toEqual(['SYNCED', 'SYNCED']);
      const stored = source!.getRepository(AssessmentAttempt);
      const receipts = source!.getRepository(AssessmentSyncReceipt);
      expect(await stored.countBy({ attemptId: event.payload.attemptId })).toBe(
        1,
      );
      expect(
        (await receipts.findOneByOrFail({ eventId: event.eventId })).status,
      ).toBe('SYNCED');
      expect(
        (await receipts.findOneByOrFail({ eventId: duplicate.eventId })).status,
      ).toBe('SYNCED');

      const conflicting = {
        ...event,
        payload: { ...event.payload, score: 0, passed: false },
      };
      await publish(conflicting);
      const deadLetter = await waitFor(
        async () => (await publisher.get(dlq, { noAck: false })) || undefined,
        'conflicting result in DLQ',
      );
      expect(deadLetter.properties.headers?.['x-learning-failure']).toBe(
        'EVENT_CONFLICT',
      );
      expect(JSON.parse(deadLetter.content.toString('utf8'))).toEqual(
        conflicting,
      );
      publisher.ack(deadLetter);
      expect(
        (
          await stored.findOneByOrFail({
            attemptId: event.payload.attemptId,
            assessmentVersion: event.payload.assessmentVersion,
          })
        ).result,
      ).toMatchObject({
        ...event.payload,
        gradedAt: new Date(event.payload.gradedAt).toISOString(),
      });
      expect(
        (await receipts.findOneByOrFail({ eventId: event.eventId })).status,
      ).toBe('SYNCED');

      const invalid = {
        ...event,
        eventId: randomUUID(),
        payload: { ...event.payload, attemptId: randomUUID(), maxScore: 0 },
      };
      events.add(invalid.eventId);
      await publish(invalid);
      const invalidLetter = await waitFor(
        async () => (await publisher.get(dlq, { noAck: false })) || undefined,
        'invalid result in DLQ',
      );
      expect(invalidLetter.properties.headers?.['x-learning-failure']).toBe(
        'INVALID_RESULT',
      );
      publisher.ack(invalidLetter);
      expect(
        await stored.countBy({ attemptId: invalid.payload.attemptId }),
      ).toBe(0);
      expect(await receipts.countBy({ eventId: invalid.eventId })).toBe(0);
    });

    it('PRG-05/08 resumes the learner and orders enrolled courses by latest activity', async () => {
      const path = `${learningPath}/resume`;
      const get = (user = learner) =>
        request(app!.getHttpServer()).get(path).set('X-Mock-User', user);
      const save = (overrides = {}) =>
        request(app!.getHttpServer())
          .put(path)
          .set('X-Mock-User', learner)
          .send({ ...scenarios.requests.saveResume, ...overrides });

      enrollmentActive = true;
      currentEnrollment = resumeEnrollment;
      try {
        scoreEnrollmentActive = true;
        const initialDashboard = await dashboardData();
        expect(initialDashboard.courses).toHaveLength(2);
        expect(
          initialDashboard.courses.find(
            (entry) => entry.courseId === scoreCourse.id,
          ),
        ).toMatchObject({
          totalRequiredLessons: 0,
          completedRequiredLessons: 0,
          lessonProgressPercent: 0,
          nextStep: { kind: 'QUIZ' },
        });
        expect(initialDashboard.recentQuizzes).toEqual([]);
        expect(await dashboardData('studentA')).toMatchObject({
          courses: [],
          recentQuizzes: [],
        });
        expect(await dashboardData('instructorA')).toMatchObject({
          courses: [],
          recentQuizzes: [],
        });
        await dashboard('invalid').expect(401);
        expect((await get().expect(200)).body.data).toBeNull();
        await get('studentA').expect(403);
        expect(
          (await save({ expectedRevision: 1 }).expect(409)).body.error.code,
        ).toBe('REVISION_CONFLICT');
        expect(
          (await save({ contentVersion: contentVersion + 1 }).expect(409)).body
            .error.code,
        ).toBe('CONTENT_VERSION_MISMATCH');
        expect(
          (await save({ lessonId: secondLesson.id }).expect(422)).body.error
            .code,
        ).toBe('INVALID_LESSON_RELATION');
        expect(
          (await save(scenarios.requests.resumeChapter2).expect(403)).body.error
            .code,
        ).toBe('PREREQUISITE_NOT_COMPLETED');
        const laterItem = {
          learningItemId: optionalReading.id,
          positionSeconds: null,
        };
        await save(laterItem).expect(403);
        await save({ positionSeconds: null }).expect(400);
        await save({ positionSeconds: 181 }).expect(400);
        expect((await get().expect(200)).body.data).toBeNull();

        const initialProgress = (await progress().expect(200)).body.data;
        const firstWrites = await Promise.all([
          save(),
          save({ positionSeconds: 0 }),
        ]);
        expect(
          firstWrites.map(({ status }) => status).sort((a, b) => a - b),
        ).toEqual([200, 409]);
        const first = parseContract(
          'LearningResumeData',
          firstWrites.find(({ status }) => status === 200)!.body.data,
        );
        expect(first).toMatchObject({
          courseId,
          userId,
          contentVersion,
          lessonId: firstLesson.id,
          learningItemId: video.id,
          revision: 1,
        });
        expect((await get().expect(200)).body.data).toEqual(first);
        const resumedDashboard = await dashboardData();
        expect(resumedDashboard.courses[0]).toMatchObject({
          courseId,
          lastActivityAt: first.updatedAt,
          lessonProgressPercent: 0,
          nextStep: {
            kind: 'LEARNING_ITEM',
            lessonId: firstLesson.id,
            learningItemId: video.id,
            positionSeconds: first.positionSeconds,
          },
        });
        expect(resumedDashboard.updatedAt).toBe(first.updatedAt);

        const updates = await Promise.all([
          save({ positionSeconds: 120.5, expectedRevision: 1 }),
          save({ positionSeconds: 180, expectedRevision: 1 }),
        ]);
        expect(
          updates.map(({ status }) => status).sort((a, b) => a - b),
        ).toEqual([200, 409]);
        expect(
          updates.find(({ status }) => status === 409)?.body.error.code,
        ).toBe('REVISION_CONFLICT');
        const latest = parseContract(
          'LearningResumeData',
          updates.find(({ status }) => status === 200)!.body.data,
        );
        expect(latest.revision).toBe(2);
        expect([120.5, 180]).toContain(latest.positionSeconds);
        expect((await get().expect(200)).body.data).toEqual(latest);
        expect((await progress().expect(200)).body.data).toEqual(
          initialProgress,
        );
        expect(
          await source!.getRepository(LearningResume).countBy({
            enrollmentId: resumeEnrollment.enrollmentId,
          }),
        ).toBe(1);

        await complete(video.id).expect(200);
        await save({
          ...laterItem,
          positionSeconds: 60,
          expectedRevision: 2,
        }).expect(400);
        const readingCheckpoint = parseContract(
          'LearningResumeData',
          (await save({ ...laterItem, expectedRevision: 2 }).expect(200)).body
            .data,
        );
        expect(readingCheckpoint).toMatchObject({
          learningItemId: optionalReading.id,
          positionSeconds: null,
          revision: 3,
        });
        expect((await get().expect(200)).body.data).toEqual(readingCheckpoint);

        outlineVersion = contentVersion + 1;
        expect((await get().expect(409)).body.error.code).toBe(
          'CONTENT_VERSION_MISMATCH',
        );
        outlineVersion = contentVersion;
        currentEnrollment = { ...resumeEnrollment, status: 'CANCELLED' };
        await get().expect(403);
        await save({ expectedRevision: 3 }).expect(403);
        expect(
          (await dashboardData()).courses.map((entry) => entry.courseId),
        ).toEqual([scoreCourse.id]);
        currentEnrollment = enrollment;
        expect((await get().expect(200)).body.data).toBeNull();
        currentEnrollment = {
          ...resumeEnrollment,
          contentVersion: contentVersion + 1,
        };
        expect((await get().expect(200)).body.data).toBeNull();
      } finally {
        currentEnrollment = enrollment;
        outlineVersion = contentVersion;
        enrollmentActive = false;
      }
    });

    it('PRG-01/02/03/05/06/07 moves an enrolled learner from zero to course completion', async () => {
      await progress().expect(403);
      await lessonProgress(firstLesson.id).expect(403);
      enrollmentActive = true;
      await progress('studentA').expect(403);
      await lessonProgress(firstLesson.id, 'studentA').expect(403);
      await lessonProgress(randomUUID()).expect(404);
      await request(app!.getHttpServer())
        .put(`/api/v1/learning/lessons/${firstLesson.id}/completion`)
        .set('X-Mock-User', learner)
        .send({ completed: false, contentVersion })
        .expect(400);
      const untouched = await lessonProgress(firstLesson.id).expect(200);
      expect(
        parseContract('LessonProgressData', untouched.body.data),
      ).toMatchObject({
        lessonId: firstLesson.id,
        status: 'NOT_STARTED',
        completedAt: null,
      });
      const lessonRows = source!.getRepository(LessonCompletion);
      const lessonKey = {
        enrollmentId: enrollment.enrollmentId,
        contentVersion,
        lessonId: firstLesson.id,
      };
      expect(
        (await completeLesson(firstLesson.id).expect(409)).body.error.code,
      ).toBe('COURSE_REQUIREMENTS_NOT_MET');
      expect(
        (await completeLesson(firstLesson.id, contentVersion + 1).expect(409))
          .body.error.code,
      ).toBe('CONTENT_VERSION_MISMATCH');
      expect(
        (await completeLesson(secondLesson.id).expect(403)).body.error.code,
      ).toBe('PREREQUISITE_NOT_COMPLETED');
      expect(await lessonRows.countBy(lessonKey)).toBe(0);
      expect((await progress().expect(200)).body.data).toMatchObject({
        status: 'NOT_STARTED',
        progressPercent: 0,
      });
      await complete(video.id, contentVersion + 1).expect(409);
      expect((await complete(reading.id).expect(403)).body.error.code).toBe(
        'PREREQUISITE_NOT_COMPLETED',
      );
      const completed = await Promise.all([
        complete(video.id),
        complete(video.id),
      ]);
      for (const response of completed) {
        expect({ status: response.status, error: response.body.error }).toEqual(
          {
            status: 200,
            error: undefined,
          },
        );
      }
      expect(completed[0].body.data).toEqual(completed[1].body.data);
      expect(
        await source!
          .getRepository(ItemCompletion)
          .countBy({ enrollmentId: enrollment.enrollmentId }),
      ).toBe(1);
      expect((await progress().expect(200)).body.data).toMatchObject({
        progressPercent: 50,
        completedRequiredLessons: 0,
        lessonProgressPercent: 0,
      });
      expect((await dashboardData()).courses[0].nextStep).toEqual({
        kind: 'COMPLETE_LESSON',
        lessonId: firstLesson.id,
      });

      const started = await lessonProgress(firstLesson.id).expect(200);
      expect(
        parseContract('LessonProgressData', started.body.data),
      ).toMatchObject({
        status: 'IN_PROGRESS',
        completedAt: null,
      });
      expect(await chapterAccess()).toMatchObject([
        {
          completedLessons: 0,
          totalLessons: 1,
          progressPercent: 0,
          status: 'UNLOCKED',
        },
        {
          completedLessons: 0,
          totalLessons: 1,
          progressPercent: 0,
          status: 'LOCKED',
        },
      ]);
      const lessonResults = await Promise.all([
        completeLesson(firstLesson.id).expect(200),
        completeLesson(firstLesson.id).expect(200),
      ]);
      const finished = parseContract(
        'LessonProgressData',
        lessonResults[0].body.data,
      );
      expect(finished).toMatchObject({
        status: 'COMPLETED',
        completedAt: expect.any(String),
      });
      expect(finished.items).toContainEqual({
        learningItemId: optionalReading.id,
        contentVersion,
        status: 'NOT_STARTED',
        completedAt: null,
        invalidatedAt: null,
        invalidationReason: null,
      });
      expect(lessonResults[1].body.data).toEqual(finished);
      expect(
        (await lessonProgress(firstLesson.id).expect(200)).body.data,
      ).toEqual(finished);
      expect(
        (await lessonRows.findOneByOrFail(lessonKey)).completedAt.toISOString(),
      ).toBe(finished.completedAt);
      expect(await lessonRows.countBy(lessonKey)).toBe(1);

      const failed = makeEvent(providers.quiz.chapterAttempt79);
      expect((await sync(failed).expect(200)).body.data.status).toBe('PENDING');
      expect((await sync(failed, 'studentA').expect(403)).body.error.code).toBe(
        'NOT_ATTEMPT_OWNER',
      );
      await publish(failed);
      await syncStatus(failed, 'SYNCED');
      const awaitingChapterQuiz = await dashboardData();
      expect(awaitingChapterQuiz.courses[0]).toMatchObject({
        completedRequiredLessons: 1,
        totalRequiredLessons: 2,
        lessonProgressPercent: 50,
        nextStep: {
          kind: 'QUIZ',
          quizId: failed.payload.quizId,
          assessmentVersion: failed.payload.assessmentVersion,
        },
      });
      expect(awaitingChapterQuiz.recentQuizzes).toMatchObject([
        {
          attemptId: failed.payload.attemptId,
          scorePercent: 79,
          passed: false,
        },
      ]);
      expect((await dashboardData('studentA')).recentQuizzes).toEqual([]);
      expect(await chapterAccess()).toMatchObject([
        {
          completedLessons: 1,
          totalLessons: 1,
          progressPercent: 100,
          status: 'UNLOCKED',
          reason: null,
        },
        {
          completedLessons: 0,
          totalLessons: 1,
          progressPercent: 0,
          status: 'LOCKED',
          reason: 'PREVIOUS_CHAPTER_NOT_COMPLETED',
        },
      ]);

      const passed = makeEvent(providers.quiz.chapterAttempt80);
      await publish(passed);
      const originalReceipt = await syncStatus(passed, 'SYNCED');
      expect(await chapterAccess()).toMatchObject([
        {
          completedLessons: 1,
          totalLessons: 1,
          progressPercent: 100,
          status: 'COMPLETED',
        },
        {
          completedLessons: 0,
          totalLessons: 1,
          progressPercent: 0,
          status: 'UNLOCKED',
        },
      ]);
      const duplicate = { ...passed, eventId: randomUUID() };
      events.add(duplicate.eventId);
      await publish(passed);
      await publish(duplicate);
      attempts.set(passed.payload.attemptId, duplicate);
      await syncStatus(duplicate, 'SYNCED');
      expect(
        await source!
          .getRepository(AssessmentAttempt)
          .countBy({ attemptId: passed.payload.attemptId }),
      ).toBe(1);
      attempts.set(passed.payload.attemptId, passed);
      expect(await syncStatus(passed, 'SYNCED')).toEqual(originalReceipt);
      const afterPass = await dashboardData();
      expect(afterPass.courses[0].nextStep).toMatchObject({
        kind: 'LEARNING_ITEM',
        lessonId: secondLesson.id,
        learningItemId: reading.id,
      });
      expect(afterPass.recentQuizzes.map(({ attemptId }) => attemptId)).toEqual(
        [passed.payload.attemptId, failed.payload.attemptId],
      );

      await complete(reading.id).expect(200);
      await completeLesson(secondLesson.id).expect(200);
      expect(await chapterAccess()).toMatchObject([
        {
          completedLessons: 1,
          totalLessons: 1,
          progressPercent: 100,
          status: 'COMPLETED',
        },
        {
          completedLessons: 1,
          totalLessons: 1,
          progressPercent: 100,
          status: 'COMPLETED',
        },
      ]);
      expect((await progress().expect(200)).body.data).toMatchObject({
        status: 'IN_PROGRESS',
        progressPercent: 100,
        lessonProgressPercent: 100,
        passedRequiredAssessments: 0,
      });
      const finalGrade = makeEvent(providers.quiz.attemptGraded);
      await publish(finalGrade);
      await syncStatus(finalGrade, 'SYNCED');
      expect((await progress().expect(200)).body.data).toMatchObject({
        status: 'COMPLETED',
        progressPercent: 100,
        passedRequiredAssessments: 1,
      });
      expect((await dashboardData()).courses[0].nextStep).toBeNull();
    }, 25000);

    it('PRG-06/07 rolls back a failed write, sends it to DLQ, then syncs on replay', async () => {
      const event = makeEvent(providers.quiz.attemptGraded);
      const stored = source!.getRepository(AssessmentAttempt);
      const receipts = source!.getRepository(AssessmentSyncReceipt);
      const constraint = `test_block_${event.eventId.replaceAll('-', '')}`;
      await source!.query(`
      ALTER TABLE learning_assessment_sync_receipts ADD CONSTRAINT ${constraint}
      CHECK (event_id <> '${event.eventId}'::uuid OR status <> 'SYNCED')
    `);
      try {
        await expect(
          app!.get(AssessmentAttemptsRepository).record(event),
        ).rejects.toThrow();
        expect(
          await stored.countBy({ attemptId: event.payload.attemptId }),
        ).toBe(0);
        expect(await receipts.countBy({ eventId: event.eventId })).toBe(0);
        await publish(event);
        const message = await waitFor(
          async () => (await publisher.get(dlq, { noAck: false })) || undefined,
          'DLQ',
          45000,
        );
        expect(message.properties.headers?.['x-learning-failure']).toBe(
          'STORAGE_UNAVAILABLE',
        );
        expect(JSON.parse(message.content.toString('utf8'))).toEqual(event);
        publisher.ack(message);
        expect((await sync(event).expect(200)).body.data).toMatchObject({
          status: 'FAILED',
          error: { code: 'PROJECTION_FAILED' },
        });
        expect(
          await stored.countBy({ attemptId: event.payload.attemptId }),
        ).toBe(0);
      } finally {
        await source!.query(
          `ALTER TABLE learning_assessment_sync_receipts DROP CONSTRAINT ${constraint}`,
        );
      }
      await publish(event);
      await syncStatus(event, 'SYNCED');
      expect(await stored.countBy({ attemptId: event.payload.attemptId })).toBe(
        1,
      );
    }, 60000);

    it('PRG-01/02/03/05 uses a pinned snapshot when Course publishes a new outline', async () => {
      enrollmentActive = true;
      publishedVersion = contentVersion + 1;
      const previousToken = process.env.COURSE_SERVICE_TOKEN;
      try {
        delete process.env.COURSE_SERVICE_TOKEN;
        const result = await progress().expect(503);
        expect(result.body.error.code).toBe('SERVICE_UNAVAILABLE');
        await lessonProgress(firstLesson.id).expect(503);
        process.env.COURSE_SERVICE_TOKEN = courseServiceToken;
        expect((await progress().expect(200)).body.data.contentVersion).toBe(
          contentVersion,
        );
        oldSnapshotAvailable = false;
        await dashboard().expect(409);
        oldSnapshotAvailable = true;
        expect((await progress().expect(200)).body.data).toMatchObject({
          contentVersion,
          totalRequiredLessons: 2,
          completedRequiredLessons: 2,
          lessonProgressPercent: 100,
        });
        expect((await dashboardData()).courses[0]).toMatchObject({
          contentVersion,
          lessonProgressPercent: 100,
        });
      } finally {
        publishedVersion = contentVersion;
        oldSnapshotAvailable = true;
        if (previousToken === undefined)
          delete process.env.COURSE_SERVICE_TOKEN;
        else process.env.COURSE_SERVICE_TOKEN = previousToken;
      }
    });
  },
);
