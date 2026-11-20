import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { parseContract } from '@lms/contracts';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { createLearningDataSource } from '../src/database/learning-database';
import { CourseSkill } from '../src/modules/mastery/entities/course-skill.entity';
import { AssessmentAttempt } from '../src/modules/progress-sync/entities/assessment-attempt.entity';
import { AssessmentSyncReceipt } from '../src/modules/progress-sync/entities/assessment-sync-receipt.entity';
import { AssessmentAttemptsRepository } from '../src/modules/progress-sync/repositories/assessment-attempts.repository';
import fixture from './fixtures/course-skills.mock.json';
import providers from './fixtures/learning-providers.mock.json';

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
const { publishedCourse, enrollment } = providers.course;
const courseId = publishedCourse.id;
const draftId = fixture.secondCourse.id;
const skillsPath = (id = courseId) => `/api/v1/learning/courses/${id}/skills`;
const internalPath = (skillId: string, id = courseId) =>
  `/api/v1/internal/courses/${id}/skills/${skillId}`;
const lookupToken = 'test-skill-lookup-token';
const courseToken = 'test-course-structure-token';
const migrationToken = 'test-migration-token';
const sample = {
  name: 'Tổ chức module',
  description: 'Controller và provider',
};

suite(
  'MST-01 course skills through NestJS, PostgreSQL and fake Course HTTP',
  () => {
    let app: INestApplication<App>;
    let database: DataSource;
    let upstream: Server;
    let enrollmentCancelled = false;
    let reviewsUnavailable = false;
    const oldEnv = { ...process.env };

    async function clean() {
      const skills = database.getRepository(CourseSkill);
      await skills.delete({ courseId });
      await skills.delete({ courseId: draftId });
    }

    beforeAll(async () => {
      const url = new URL(databaseUrl!);
      if (
        !['127.0.0.1', 'localhost'].includes(url.hostname) ||
        !url.pathname.endsWith('_test')
      )
        throw new Error('Use a local *_test PostgreSQL database');

      database = createLearningDataSource(databaseUrl);
      await database.initialize();
      await database.runMigrations();
      upstream = createServer((incoming, response) => {
        const { pathname, search } = new URL(
          incoming.url ?? '/',
          'http://fixture',
        );
        const actor = incoming.headers['x-mock-user'];
        const reply = (status: number, data: unknown) => {
          response.writeHead(status, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify({ data }));
        };

        if (pathname === `/api/v1/internal/courses/${courseId}/structure`) {
          if (incoming.headers.authorization !== `Bearer ${courseToken}`)
            return reply(401, null);
          if (search !== `?contentVersion=${enrollment.contentVersion}`)
            return reply(409, null);
          return reply(200, providers.course.structure);
        }

        if (
          pathname === '/api/v1/enrollments/me' &&
          search === '?page=1&limit=100'
        ) {
          const items =
            actor === 'studentB'
              ? [
                  {
                    course: publishedCourse,
                    enrollment: {
                      ...enrollment,
                      status: enrollmentCancelled ? 'CANCELLED' : 'ACTIVE',
                    },
                  },
                ]
              : [];
          return reply(200, {
            items,
            page: 1,
            limit: 100,
            total: items.length,
          });
        }

        const match = /^\/api\/v1\/courses\/([^/]+)\/reviews$/.exec(pathname);
        if (match && search === '?page=1&limit=1') {
          const owner =
            match[1] === courseId
              ? 'instructorA'
              : match[1] === draftId
                ? 'instructorB'
                : undefined;
          if (!owner) return reply(404, null);
          if (reviewsUnavailable) return reply(503, null);
          if (actor !== owner && actor !== 'adminA') return reply(403, null);
          return reply(200, { items: [], page: 1, limit: 1, total: 0 });
        }
        return reply(404, null);
      });
      await new Promise<void>((resolve, reject) => {
        upstream.once('error', reject);
        upstream.listen(0, '127.0.0.1', resolve);
      });
      Object.assign(process.env, {
        NODE_ENV: 'test',
        MOCK_AUTH: 'true',
        DATABASE_URL: databaseUrl,
        COURSE_URL: `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`,
        COURSE_SERVICE_TOKEN: courseToken,
        LEARNING_SKILL_LOOKUP_TOKEN: lookupToken,
        LEARNING_SERVICE_TOKEN: migrationToken,
        LEARNING_MASTERY_DEVELOPING_MIN: '45',
        LEARNING_MASTERY_PROFICIENT_MIN: '75',
      });
      delete process.env.RABBITMQ_URL;
      const module = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      app = module.createNestApplication();
      await app.init();
    });

    beforeEach(async () => {
      await clean();
      enrollmentCancelled = false;
      reviewsUnavailable = false;
    });

    afterAll(async () => {
      await app?.close();
      if (upstream?.listening) {
        upstream.closeAllConnections();
        await new Promise<void>((resolve, reject) =>
          upstream.close((error) => (error ? reject(error) : resolve())),
        );
      }
      if (database?.isInitialized) {
        await clean();
        await database.destroy();
      }
      process.env = oldEnv;
    });

    function list(actor: string, id?: string) {
      return request(app.getHttpServer())
        .get(skillsPath(id))
        .set('X-Mock-User', actor);
    }

    function create(actor: string, id = courseId, body: unknown = sample) {
      return request(app.getHttpServer())
        .post(skillsPath(id))
        .set('X-Mock-User', actor)
        .send(body as object);
    }

    function patch(
      skillId: string,
      body: unknown,
      id = courseId,
      actor = 'instructorA',
    ) {
      return request(app.getHttpServer())
        .patch(`${skillsPath(id)}/${skillId}`)
        .set('X-Mock-User', actor)
        .send(body as object);
    }

    it('creates and updates a skill, hides inactive entries from students and preserves the stable reference', async () => {
      const initial = (await list('studentB').expect(200)).body.data;
      expect(parseContract('CourseSkillsData', initial)).toEqual({
        skills: [],
      });
      const created = await create('instructorA', courseId, {
        name: `  ${sample.name}  `,
        description: sample.description,
      })
        .set('X-Request-Id', 'mst01-catalog-test')
        .expect(201);
      expect(created.body.meta.requestId).toBe('mst01-catalog-test');
      const skill = parseContract('CourseSkillData', created.body.data);
      expect(skill).toMatchObject({
        ...sample,
        courseId,
        status: 'ACTIVE',
        version: 1,
      });
      expect((await list('studentB').expect(200)).body.data.skills).toEqual([
        skill,
      ]);

      const edit = (
        await patch(skill.id.toUpperCase(), {
          description: '  Nội dung mới  ',
          expectedVersion: 1,
        }).expect(200)
      ).body.data;
      expect(edit).toMatchObject({
        id: skill.id,
        description: 'Nội dung mới',
        version: 2,
      });
      const retired = (
        await patch(skill.id, {
          status: 'INACTIVE',
          expectedVersion: 2,
        }).expect(200)
      ).body.data;
      expect(retired).toMatchObject({
        id: skill.id,
        status: 'INACTIVE',
        version: 3,
      });
      expect((await list('studentB').expect(200)).body.data.skills).toEqual([]);
      expect((await list('instructorA').expect(200)).body.data.skills).toEqual([
        retired,
      ]);

      const reference = await request(app.getHttpServer())
        .get(internalPath(skill.id))
        .set('Authorization', `Bearer ${lookupToken}`)
        .expect(200);
      expect(reference.body.data).toEqual(retired);
      expect(
        await database.getRepository(CourseSkill).countBy({ courseId }),
      ).toBe(1);
    });

    it('allows management of a draft, scopes writes to the course and checks student enrollment', async () => {
      const draft = await create('instructorB', draftId).expect(201);
      const skill = parseContract('CourseSkillData', draft.body.data);
      expect(skill.courseId).toBe(draftId);
      expect(
        (await list('adminA', draftId).expect(200)).body.data.skills,
      ).toEqual([skill]);
      expect(
        (await list('instructorA', draftId).expect(403)).body.error.code,
      ).toBe('NOT_COURSE_OWNER');
      await patch(skill.id, { status: 'INACTIVE', expectedVersion: 1 }).expect(
        404,
      );
      await patch(
        skill.id,
        { status: 'INACTIVE', expectedVersion: 1 },
        draftId,
        'adminA',
      ).expect(200);
      expect((await create('instructorB').expect(403)).body.error.code).toBe(
        'NOT_COURSE_OWNER',
      );
      await create('studentB').expect(403);
      await list('studentA').expect(403);
      await list('studentB', draftId).expect(403);
      enrollmentCancelled = true;
      await list('studentB').expect(403);
    });

    it('rejects invalid input or an unavailable Course provider without writing to PostgreSQL', async () => {
      await request(app.getHttpServer()).get(skillsPath()).expect(401);
      await create('instructorA', 'bad-course').expect(400);
      await create('instructorA', courseId, { ...sample, name: '   ' }).expect(
        400,
      );
      await create('instructorA', courseId, {
        ...sample,
        description: 'abc\u0000def',
      }).expect(400);
      await create('instructorA', courseId, {
        ...sample,
        status: 'INACTIVE',
      }).expect(400);
      reviewsUnavailable = true;
      await create('instructorA').expect(503);
      expect(
        await database.getRepository(CourseSkill).countBy({ courseId }),
      ).toBe(0);
    });

    it('serializes concurrent edits so only one request can write a given version', async () => {
      const { id } = parseContract(
        'CourseSkillData',
        (await create('instructorA').expect(201)).body.data,
      );
      await patch(id, { expectedVersion: 1 }).expect(400);
      const results = await Promise.all([
        patch(id, { expectedVersion: 1, name: 'Cập nhật A' }),
        patch(id, { expectedVersion: 1, name: 'Cập nhật B' }),
      ]);
      expect(
        results.map((result) => result.status).sort((a, b) => a - b),
      ).toEqual([200, 409]);
      const accepted = results.find((result) => result.status === 200)!;
      const rejected = results.find((result) => result.status === 409)!;
      expect(rejected.body.error.code).toBe('VERSION_CONFLICT');
      expect((await list('instructorA').expect(200)).body.data.skills).toEqual([
        expect.objectContaining({
          id,
          name: accepted.body.data.name,
          version: 2,
        }),
      ]);
    });

    it('requires the independent read credential and keeps internal lookup scoped to the course', async () => {
      const { id } = parseContract(
        'CourseSkillData',
        (await create('instructorA').expect(201)).body.data,
      );
      const get = (course?: string) =>
        request(app.getHttpServer()).get(internalPath(id, course));
      await get().set('X-Mock-User', 'adminA').expect(401);
      await get().set('Authorization', `Bearer ${migrationToken}`).expect(401);
      await get(draftId)
        .set('Authorization', `Bearer ${lookupToken}`)
        .expect(404);
      await request(app.getHttpServer())
        .post(`/api/v1/internal/courses/${courseId}/migrations`)
        .set('Authorization', `Bearer ${lookupToken}`)
        .send({})
        .expect(401);
      await get().set('Authorization', `Bearer ${lookupToken}`).expect(200);
    });

    it('MST-03/05/07 serves an empty result when the learner has no graded evidence', async () => {
      const path = `/api/v1/learning/courses/${courseId}/mastery`;
      for (const url of [path, `${path}/history`]) {
        const empty = await request(app.getHttpServer())
          .get(url)
          .set('X-Mock-User', 'studentB')
          .expect(200);
        expect(empty.body.data).toMatchObject(
          url === path
            ? { skills: [], algorithmVersion: 'weighted-score-v1' }
            : { items: [], total: 0 },
        );
        await request(app.getHttpServer())
          .get(url)
          .set('X-Mock-User', 'studentA')
          .expect(403);
      }
    });

    it('MST-04 uses deployment thresholds for both mastery endpoints', async () => {
      const skill = parseContract(
        'CourseSkillData',
        (await create('instructorA').expect(201)).body.data,
      );
      await list('studentB').query({ page: 2 }).expect(400);
      const original = providers.quiz.attemptGraded;
      const event = parseContract('AttemptGradedV2Event', {
        ...original,
        eventId: randomUUID(),
        payload: {
          ...original.payload,
          attemptId: randomUUID(),
          skillScores: [{ skillId: skill.id, score: 7, maxScore: 10 }],
        },
      });
      try {
        expect(await app.get(AssessmentAttemptsRepository).record(event)).toBe(
          'SYNCED',
        );
        const path = `/api/v1/learning/courses/${courseId}/mastery`;
        const get = (url: string) =>
          request(app.getHttpServer())
            .get(url)
            .set('X-Mock-User', 'studentB')
            .expect(200);
        const current = parseContract(
          'MasteryData',
          (await get(path)).body.data,
        );
        const point = parseContract(
          'MasteryHistoryPoint',
          (await get(`${path}/history`)).body.data.items[0],
        );
        expect(current.skills[0]).toMatchObject({
          skillId: skill.id,
          scorePercent: 70,
          level: 'DEVELOPING',
        });
        expect(point.skills).toEqual(current.skills);
      } finally {
        await database
          .getRepository(AssessmentSyncReceipt)
          .delete({ eventId: event.eventId });
        await database
          .getRepository(AssessmentAttempt)
          .delete({ eventId: event.eventId });
      }
    });

    function validateSkills(
      skillIds: unknown,
      id = courseId,
      token = lookupToken,
    ) {
      return request(app.getHttpServer())
        .post(`/api/v1/internal/courses/${id}/skills/validate`)
        .set('Authorization', `Bearer ${token}`)
        .send({ skillIds });
    }

    it('MST-02 accepts several active IDs and identifies each unassignable skill in a batch', async () => {
      const add = async (actor: string, id?: string) =>
        parseContract(
          'CourseSkillData',
          (await create(actor, id).expect(201)).body.data,
        ).id;
      const first = await add('instructorA');
      const second = await add('instructorA');
      const inactive = await add('instructorA');
      const foreign = await add('instructorB', draftId);
      const missing = randomUUID();
      await patch(inactive, { status: 'INACTIVE', expectedVersion: 1 }).expect(
        200,
      );
      const accepted = await validateSkills(
        [first.toUpperCase(), second],
        courseId.toUpperCase(),
      )
        .set('X-Request-Id', 'mst02-validate')
        .expect('X-Request-Id', 'mst02-validate')
        .expect(204);
      expect(accepted.text).toBe('');
      const rejected = await validateSkills([
        first,
        foreign,
        inactive,
        missing,
      ]).expect(422);
      expect(rejected.body.error).toMatchObject({
        code: 'INVALID_SKILL_REFERENCE',
        details: { skillIds: [foreign, inactive, missing] },
      });
      await validateSkills([foreign], draftId).expect(204);
    });

    it('MST-02 denies calls without the lookup credential and rejects invalid or duplicate IDs', async () => {
      const a = '00000000-0000-4000-8000-000000000a01';
      await validateSkills([a], courseId, migrationToken).expect(401);
      await request(app.getHttpServer())
        .post(`/api/v1/internal/courses/${courseId}/skills/validate`)
        .set('X-Mock-User', 'adminA')
        .send({ skillIds: [a] })
        .expect(401);
      await validateSkills([a, a.toUpperCase()]).expect(400);
      await validateSkills(['not-a-uuid']).expect(400);
      await validateSkills([]).expect(400);
      await validateSkills(
        Array.from({ length: 101 }, () => randomUUID()),
      ).expect(400);
    });

    it('MST-02 lets fake Quiz save a new question version after validation and keep the earlier mapping', async () => {
      const first = parseContract(
        'CourseSkillData',
        (await create('instructorA').expect(201)).body.data,
      ).id;
      const second = parseContract(
        'CourseSkillData',
        (await create('instructorA').expect(201)).body.data,
      ).id;
      const question = {
        type: 'SINGLE_CHOICE',
        prompt: 'NestJS tổ chức controller và provider trong thành phần nào?',
        choices: [
          { id: randomUUID(), text: 'Module' },
          { id: randomUUID(), text: 'Template' },
        ],
        points: 10,
        explanation: null,
      };
      const input = { ...question, correctChoiceIds: [question.choices[0].id] };
      // Fake Quiz owns versioned question data used only in this integration test.
      const snapshots = new Map<number, ReturnType<typeof questionInput>>();
      function questionInput(skillIds: string[]) {
        return parseContract('CreateQuestionRequest', { ...input, skillIds });
      }
      async function publish(skillIds: string[]) {
        const next = questionInput(skillIds);
        const previous = snapshots.get(snapshots.size);
        const additions = next.skillIds.filter(
          (id) => !previous?.skillIds.includes(id),
        );
        if (additions.length) {
          const result = await validateSkills(additions);
          if (result.status !== 204) return result.status;
        }
        snapshots.set(snapshots.size + 1, next);
        return 204;
      }

      expect(await publish([first])).toBe(204);
      await patch(first, { status: 'INACTIVE', expectedVersion: 1 }).expect(
        200,
      );
      expect(await publish([first, second])).toBe(204);
      expect(await publish([randomUUID()])).toBe(422);
      expect(snapshots.size).toBe(2);
      expect(snapshots.get(1)?.skillIds).toEqual([first]);
      expect(snapshots.get(2)?.skillIds).toEqual([first, second]);
      // Build the fake graded payload from the version actually taken by the learner.
      const old = snapshots.get(1)!;
      const result = parseContract('AttemptGradedV2Event', {
        ...providers.quiz.attemptGraded,
        payload: {
          ...providers.quiz.attemptGraded.payload,
          skillScores: old.skillIds.map((skillId) => ({
            skillId,
            score: old.points,
            maxScore: old.points,
          })),
        },
      });
      expect(result.payload.skillScores).toEqual([
        { skillId: first, score: 10, maxScore: 10 },
      ]);
    });
  },
);
