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
import { createLearningDataSource } from '../src/database/learning-database';
import { AssessmentAttempt } from '../src/modules/progress-sync/entities/assessment-attempt.entity';
import { AssessmentSyncReceipt } from '../src/modules/progress-sync/entities/assessment-sync-receipt.entity';
import { AssessmentAttemptsRepository } from '../src/modules/progress-sync/repositories/assessment-attempts.repository';
import { ItemCompletion } from '../src/modules/progress/entities/item-completion.entity';
import providers from './fixtures/learning-providers.mock.json';

const databaseUrl = process.env.TEST_DATABASE_URL;
const brokerUrl = process.env.TEST_RABBITMQ_URL;
const suite = databaseUrl && brokerUrl ? describe : describe.skip;
const exchange = 'lms.events';
const queue = 'learning.quiz-results.v2';
const dlq = `${queue}.dlq`;
const serviceToken = 'fixture-quiz-service-token';
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
    const [chapterOne, chapterTwo] = structure.outline.chapters;
    const video = chapterOne.lessons[0].items[0];
    const reading = chapterTwo.lessons[0].items[0];
    const attempts = new Map<string, AttemptGradedV2Event>();
    const events = new Set<string>();
    let enrollmentActive = false;
    let outlineVersion = contentVersion;

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
        if (url.pathname === '/api/v1/enrollments/me') {
          const items =
            enrollmentActive && req.headers['x-mock-user'] === learner
              ? [{ enrollment, course: courseData }]
              : [];
          return json(res, {
            items,
            page: Number(url.searchParams.get('page')),
            limit: Number(url.searchParams.get('limit')),
            total: items.length,
          });
        }
        if (url.pathname === `${coursePath}/outline`)
          return json(res, {
            ...structure.outline,
            contentVersion: outlineVersion,
          });
        if (url.pathname === `${coursePath}/completion-policy`)
          return json(res, structure.completionPolicy);
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
            userId,
            courseId,
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
      process.env.QUIZ_URL = `http://127.0.0.1:${(quiz.address() as AddressInfo).port}`;
      process.env.QUIZ_SERVICE_TOKEN = serviceToken;
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

    afterAll(async () => {
      await app?.close();
      await broker?.close();
      for (const server of [course, quiz]) {
        if (server?.listening)
          await new Promise<void>((resolve) => server.close(() => resolve()));
      }
      if (source?.isInitialized) {
        for (const eventId of events) {
          await source.getRepository(AssessmentSyncReceipt).delete({ eventId });
          await source.getRepository(AssessmentAttempt).delete({ eventId });
        }
        await source
          .getRepository(ItemCompletion)
          .delete({ enrollmentId: enrollment.enrollmentId });
        await source.destroy();
      }
      process.env = oldEnv;
    });

    function progress(student = learner) {
      return request(app!.getHttpServer())
        .get(`${learningPath}/progress`)
        .set('X-Mock-User', student);
    }

    function complete(itemId: string, version = contentVersion) {
      return request(app!.getHttpServer())
        .put(`/api/v1/learning/items/${itemId}/completion`)
        .set('X-Mock-User', learner)
        .send({ completed: true, contentVersion: version });
    }

    async function chapterStates() {
      const result = await request(app!.getHttpServer())
        .get(`${learningPath}/chapters/access`)
        .set('X-Mock-User', learner)
        .expect(200);
      return parseContract(
        'CourseChapterAccessData',
        result.body.data,
      ).chapters.map(({ status, reason }) => [status, reason]);
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
    ) {
      return waitFor(async () => {
        const result = await sync(event).expect(200);
        const data = parseContract('ProgressSyncData', result.body.data);
        return data.status === status ? data : undefined;
      }, status);
    }

    it('PRG-01/02/03/06/07 moves an enrolled learner from zero to course completion', async () => {
      await progress().expect(403);
      enrollmentActive = true;
      await progress('studentA').expect(403);
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
      expect((await progress().expect(200)).body.data.progressPercent).toBe(50);

      const failed = makeEvent(providers.quiz.chapterAttempt79);
      expect((await sync(failed).expect(200)).body.data.status).toBe('PENDING');
      expect((await sync(failed, 'studentA').expect(403)).body.error.code).toBe(
        'NOT_ATTEMPT_OWNER',
      );
      await publish(failed);
      await syncStatus(failed, 'SYNCED');
      expect(await chapterStates()).toEqual([
        ['UNLOCKED', null],
        ['LOCKED', 'PREVIOUS_CHAPTER_NOT_COMPLETED'],
      ]);

      const passed = makeEvent(providers.quiz.chapterAttempt80);
      await publish(passed);
      const originalReceipt = await syncStatus(passed, 'SYNCED');
      expect(await chapterStates()).toEqual([
        ['COMPLETED', null],
        ['UNLOCKED', null],
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

      await complete(reading.id).expect(200);
      expect((await progress().expect(200)).body.data).toMatchObject({
        status: 'IN_PROGRESS',
        progressPercent: 100,
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

    it('PRG-02/03 rejects a changed Course outline for a pinned enrollment', async () => {
      enrollmentActive = true;
      outlineVersion = contentVersion + 1;
      try {
        const result = await progress().expect(409);
        expect(result.body.error.code).toBe('CONTENT_VERSION_MISMATCH');
      } finally {
        outlineVersion = contentVersion;
      }
    });
  },
);
