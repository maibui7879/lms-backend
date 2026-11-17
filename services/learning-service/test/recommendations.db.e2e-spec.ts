import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { parseContract } from '@lms/contracts';
import type { PageData } from '@lms/contracts';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { createLearningDataSource } from '../src/database/learning-database';
import { CourseSkill } from '../src/modules/mastery/entities/course-skill.entity';
import { MasteryCurrent } from '../src/modules/mastery/entities/mastery-current.entity';
import { MasterySnapshot } from '../src/modules/mastery/entities/mastery-snapshot.entity';
import { AssessmentAttempt } from '../src/modules/progress-sync/entities/assessment-attempt.entity';
import { AssessmentSyncReceipt } from '../src/modules/progress-sync/entities/assessment-sync-receipt.entity';
import { AssessmentAttemptsRepository } from '../src/modules/progress-sync/repositories/assessment-attempts.repository';
import { ItemCompletion } from '../src/modules/progress/entities/item-completion.entity';
import { CourseItemMigration } from '../src/modules/progress/entities/course-item-migration.entity';
import { SkillPrerequisites } from '../src/modules/recommendations/entities/skill-prerequisites.entity';
import fixture from './fixtures/recommendations.mock.json';
import providers from './fixtures/learning-providers.mock.json';

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

suite(
  'ADP-01/02/03/05 recommendations with PostgreSQL and fake Course/Quiz',
  () => {
    const courseId = randomUUID();
    const enrollmentId = randomUUID();
    const skillId = randomUUID();
    const secondSkillId = randomUUID();
    const env = { ...process.env };
    const token = 'recommendation-course-test-token';
    const quizToken = 'recommendation-quiz-test-token';
    const enrollment = parseContract('EnrollmentSnapshotData', {
      ...providers.course.enrollment,
      courseId,
      enrollmentId,
    });
    const { contentVersion, userId } = enrollment;
    const structure = parseContract(
      'CourseLearningStructure',
      structuredClone(providers.course.structure),
    );
    structure.outline.courseId = courseId;
    structure.completionPolicy.courseId = courseId;
    for (const chapter of structure.outline.chapters) {
      chapter.courseId = courseId;
      for (const lesson of chapter.lessons) {
        lesson.courseId = courseId;
        for (const item of lesson.items) item.courseId = courseId;
      }
    }
    const [chapterOne, chapterTwo] = structure.outline.chapters;
    const [first] = chapterOne.lessons;
    const [second] = chapterTwo.lessons;
    const [video] = first.items;
    const laterInChapter = {
      ...second,
      id: randomUUID(),
      title: 'Ôn tập trong chương',
      chapterId: chapterOne.id,
      order: first.order + 1,
      skillIds: [skillId],
    };
    laterInChapter.items = second.items.map((item) => ({
      ...item,
      id: randomUUID(),
      lessonId: laterInChapter.id,
      required: false,
    }));
    chapterOne.lessons.push(laterInChapter);
    first.skillIds = [secondSkillId, skillId.toUpperCase()];
    second.skillIds = [skillId];
    const [practice, spent, denied, nextPractice] = fixture.quizzes;
    for (const practice of fixture.quizzes) {
      const lesson = practice.lessonId === first.id ? first : second;
      lesson.items.push({
        id: practice.itemId,
        quizId: practice.quizId,
        assessmentVersion: practice.assessmentVersion,
        courseId,
        lessonId: lesson.id,
        title: practice.title,
        order: lesson.items.length,
        version: 1,
        contentVersion,
        type: 'QUIZ',
        required: false,
      });
    }

    let app: INestApplication<App> | undefined;
    let source: DataSource | undefined;
    let attempts: AssessmentAttemptsRepository;
    let status = enrollment.status;
    let includeMappings = true;
    let available = true;
    let inconsistentEnrollmentPage = false;
    let snapshotCase:
      | 'foreign-item'
      | 'wrong-version-item'
      | 'wrong-parent'
      | 'duplicate-quiz'
      | 'mixed-chapter-case'
      | 'unknown-chapter-policy'
      | 'duplicate-chapter-policy'
      | 'item-from-other-chapter'
      | 'unknown-course-item'
      | null = null;
    let quizError:
      'wrong-user' | 'wrong-version' | 'missing' | 'timeout' | null = null;
    const lookedUpQuizzes: string[] = [];
    const enrollmentPages: string[] = [];
    const requestedSnapshots: string[] = [];
    const foreign = providers.identity.studentA.id;
    const course = createServer((req, res) => {
      const url = new URL(req.url!, 'http://localhost');
      const send = (data: unknown) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ data }));
      };
      if (url.pathname === '/api/v1/enrollments/me') {
        enrollmentPages.push(url.searchParams.get('page') ?? '');
        if (inconsistentEnrollmentPage)
          return send({
            items: [],
            total: 401,
            page: Number(url.searchParams.get('page')),
            limit: Number(url.searchParams.get('limit')),
          });
        const items =
          req.headers['x-mock-user'] === 'studentB'
            ? [
                {
                  enrollment: { ...enrollment, status },
                  course: {
                    ...providers.course.publishedCourse,
                    id: courseId,
                    contentVersion: contentVersion + 1,
                  },
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
      if (url.pathname === `/api/v1/courses/${courseId}/reviews`) {
        if (
          !['instructorA', 'adminA'].includes(
            String(req.headers['x-mock-user']),
          )
        )
          return res.writeHead(403).end();
        return send({ items: [], total: 0, page: 1, limit: 1 });
      }
      if (url.pathname === `/api/v1/internal/courses/${courseId}/structure`) {
        if (req.headers.authorization !== `Bearer ${token}`)
          return res.writeHead(401).end();
        requestedSnapshots.push(url.searchParams.get('contentVersion') ?? '');
        if (
          !available ||
          url.searchParams.get('contentVersion') !== String(contentVersion)
        )
          return res.writeHead(409).end();
        const payload = structuredClone(structure);
        const target = payload.outline.chapters[0].lessons[0];
        const item = target.items.find(({ id }) => id === practice.itemId)!;
        if (snapshotCase === 'foreign-item') item.courseId = foreign;
        if (snapshotCase === 'wrong-version-item') item.contentVersion += 1;
        if (snapshotCase === 'wrong-parent') target.chapterId = chapterTwo.id;
        const firstPolicy = payload.completionPolicy.chapterPolicies.find(
          (entry) => entry.chapterId === chapterOne.id,
        )!;
        if (snapshotCase === 'unknown-chapter-policy')
          firstPolicy.chapterId = foreign;
        if (snapshotCase === 'duplicate-chapter-policy')
          payload.completionPolicy.chapterPolicies.push({
            ...firstPolicy,
            requiredAssessments: [],
          });
        if (snapshotCase === 'item-from-other-chapter')
          firstPolicy.requiredItemIds = [second.items[0].id];
        if (snapshotCase === 'unknown-course-item')
          payload.completionPolicy.requiredItemIds.push(foreign);
        if (snapshotCase === 'mixed-chapter-case') {
          const chapterId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
          const chapter = payload.outline.chapters[0];
          const policy = payload.completionPolicy.chapterPolicies.find(
            (entry) => entry.chapterId === chapter.id,
          )!;
          chapter.id = chapterId.toUpperCase();
          for (const lesson of chapter.lessons) lesson.chapterId = chapterId;
          policy.chapterId = chapterId;
        }
        if (snapshotCase === 'duplicate-quiz' && item.type === 'QUIZ') {
          target.items.push({
            ...item,
            id: '00000000-0000-4000-8000-000000000b35',
            quizId: item.quizId.toUpperCase(),
            order: target.items.length,
          });
        }
        if (!includeMappings)
          for (const chapter of payload.outline.chapters)
            for (const lesson of chapter.lessons) delete lesson.skillIds;
        return send(payload);
      }
      res.writeHead(404).end();
    });
    const quiz = createServer((req, res) => {
      const url = new URL(req.url!, 'http://localhost');
      const match =
        /^\/api\/v1\/internal\/quizzes\/([^/]+)\/recommendation-context$/.exec(
          url.pathname,
        );
      if (!match || req.method !== 'GET') return res.writeHead(404).end();
      if (req.headers.authorization !== `Bearer ${quizToken}`)
        return res.writeHead(401).end();
      const sample = fixture.quizzes.find(
        ({ quizId }) => match[1].toLowerCase() === quizId,
      );
      if (!sample) return res.writeHead(404).end();
      lookedUpQuizzes.push(sample.quizId);
      if (
        url.searchParams.get('courseId') !== courseId ||
        url.searchParams.get('userId') !== userId ||
        url.searchParams.get('assessmentVersion') !==
          String(sample.assessmentVersion) ||
        req.headers['x-request-id'] !== 'adp-workflow'
      )
        return res.writeHead(400).end();
      if (quizError === 'missing') return res.writeHead(404).end();
      if (quizError === 'timeout') return res.writeHead(504).end();
      return res.writeHead(200, { 'Content-Type': 'application/json' }).end(
        JSON.stringify({
          data: {
            quizId: sample.quizId,
            courseId,
            userId: quizError === 'wrong-user' ? foreign : userId,
            assessmentVersion:
              quizError === 'wrong-version'
                ? sample.assessmentVersion + 1
                : sample.assessmentVersion,
            quizType: sample.quizType,
            skillIds: [skillId],
            attemptsRemaining: sample.attemptsRemaining,
            canStart: sample.canStart,
          },
        }),
      );
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
      const now = new Date();
      await source.getRepository(CourseSkill).insert(
        [
          { id: skillId, name: 'Tổ chức module' },
          { id: secondSkillId, name: 'Kỹ năng bổ trợ khác' },
        ].map((skill) => ({
          ...skill,
          courseId,
          description: '',
          status: 'ACTIVE' as const,
          version: 1,
          createdAt: now,
          updatedAt: now,
        })),
      );
      for (const server of [course, quiz])
        await new Promise<void>((resolve, reject) => {
          server.once('error', reject);
          server.listen(0, '127.0.0.1', resolve);
        });
      process.env.NODE_ENV = 'test';
      process.env.MOCK_AUTH = 'true';
      process.env.DATABASE_URL = databaseUrl;
      delete process.env.RABBITMQ_URL;
      process.env.COURSE_URL = `http://127.0.0.1:${(course.address() as AddressInfo).port}`;
      process.env.COURSE_SERVICE_TOKEN = token;
      process.env.QUIZ_URL = `http://127.0.0.1:${(quiz.address() as AddressInfo).port}`;
      process.env.QUIZ_SERVICE_TOKEN = quizToken;
      process.env.LEARNING_MASTERY_DEVELOPING_MIN = '40';
      process.env.LEARNING_MASTERY_PROFICIENT_MIN = '70';
      const testing = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      app = testing.createNestApplication();
      await app.init();
      attempts = testing.get(AssessmentAttemptsRepository);
    }, 20000);

    beforeEach(async () => {
      status = enrollment.status;
      includeMappings = true;
      available = true;
      inconsistentEnrollmentPage = false;
      snapshotCase = null;
      quizError = null;
      lookedUpQuizzes.length = 0;
      enrollmentPages.length = 0;
      requestedSnapshots.length = 0;
      await source!.getRepository(AssessmentSyncReceipt).delete({ courseId });
      await source!.getRepository(AssessmentAttempt).delete({ courseId });
      await source!.getRepository(ItemCompletion).delete({ enrollmentId });
      await source!.getRepository(CourseItemMigration).delete({ courseId });
      await source!.getRepository(SkillPrerequisites).delete({ courseId });
    });

    afterAll(async () => {
      try {
        await app?.close();
        for (const server of [course, quiz])
          if (server.listening)
            await new Promise<void>((resolve) => server.close(() => resolve()));
        if (source?.isInitialized) {
          await source
            .getRepository(AssessmentSyncReceipt)
            .delete({ courseId });
          await source.getRepository(AssessmentAttempt).delete({ courseId });
          await source.getRepository(ItemCompletion).delete({ enrollmentId });
          await source.getRepository(CourseItemMigration).delete({ courseId });
          await source.getRepository(MasteryCurrent).delete({ enrollmentId });
          await source.getRepository(MasterySnapshot).delete({ enrollmentId });
          await source.getRepository(SkillPrerequisites).delete({ courseId });
          await source.getRepository(CourseSkill).delete({ courseId });
          await source.destroy();
        }
      } finally {
        process.env = env;
      }
    });

    const get = (query = '', actor = 'studentB') => {
      const http = request(app!.getHttpServer())
        .get(`/api/v1/learning/me/recommendations${query}`)
        .set('X-Request-Id', 'adp-workflow');
      return actor ? http.set('X-Mock-User', actor) : http;
    };
    const list = async (query = '', actor = 'studentB') => {
      const res = await get(query, actor)
        .expect(200)
        .expect('x-request-id', 'adp-workflow');
      expect(res.body.meta.requestId).toBe('adp-workflow');
      const data = res.body.data as PageData<unknown>;
      return {
        ...data,
        items: data.items.map((item) =>
          parseContract('RecommendationData', item),
        ),
      };
    };

    async function record(
      sample: (typeof fixture.attempts)[number],
      owner = userId,
      secondScore = 7.6,
      assessmentVersion = providers.quiz.attemptGraded.payload
        .assessmentVersion,
    ) {
      const template = providers.quiz.attemptGraded;
      const { score, maxScore, questionCount } = sample;
      const gradedAt =
        sample.gradedAt ??
        new Date(Date.now() - sample.daysAgo! * 86400000).toISOString();
      return attempts.record(
        parseContract('AttemptGradedV2Event', {
          ...template,
          eventId: randomUUID(),
          occurredAt: gradedAt,
          payload: {
            ...template.payload,
            attemptId: randomUUID(),
            courseId,
            userId: owner,
            assessmentVersion,
            score,
            maxScore,
            passed: false,
            gradedAt,
            skillScores: [
              { skillId, score, maxScore, questionCount },
              {
                skillId: secondSkillId,
                score: secondScore,
                maxScore,
                questionCount,
              },
            ],
          },
        }),
      );
    }

    it('uses the pinned outline, checks sequential access and explains the weakest mapped skill', async () => {
      const empty = { items: [], page: 1, limit: 20, total: 0 };
      await get('', '').expect(401);
      await get('', 'instructorA').expect(403);
      await get(`?userId=${foreign}`).expect(400);
      await get('?page=1&page=2').expect(400);
      expect(await list()).toEqual(empty);
      const [few, more] = fixture.attempts;
      expect(await record(more, foreign)).toBe('SYNCED');
      expect(await record(few)).toBe('SYNCED');
      expect(await list()).toEqual(empty);
      expect(await record(more)).toBe('SYNCED');
      const firstRead = await list();
      expect(firstRead).toEqual({
        ...empty,
        total: 1,
        items: [
          {
            courseId,
            lessonId: first.id,
            learningItemId: null,
            reason: 'LOW_MASTERY',
            explanation:
              'Kỹ năng Tổ chức module đạt 35% từ 8 câu đã chấm. Ôn bài Giới thiệu module.',
          },
        ],
      });
      expect(lookedUpQuizzes).toEqual([]);
      expect(await list('', 'studentA')).toEqual(empty);
      expect(
        await source!.getRepository(MasteryCurrent).countBy({ enrollmentId }),
      ).toBe(0);
      expect(
        await source!.getRepository(MasterySnapshot).countBy({ enrollmentId }),
      ).toBe(0);

      await request(app!.getHttpServer())
        .put(`/api/v1/learning/items/${video.id}/completion`)
        .set('X-Mock-User', 'studentB')
        .send({ completed: true, contentVersion })
        .expect(200);
      const nextPage = await list('?page=2&limit=1');
      expect(nextPage).toMatchObject({
        total: 3,
        page: 2,
        limit: 1,
        items: [{ lessonId: first.id, learningItemId: practice.itemId }],
      });
      expect(await list('?page=2&limit=1')).toEqual(nextPage);
      const [availableQuiz] = nextPage.items;
      expect((await list('?page=3&limit=1')).items[0].lessonId).toBe(
        laterInChapter.id,
      );
      expect(availableQuiz).toMatchObject({
        courseId,
        lessonId: first.id,
        learningItemId: practice.itemId,
        reason: 'LOW_MASTERY',
        explanation:
          'Kỹ năng Tổ chức module đạt 35% từ 8 câu đã chấm. Làm “Quiz ôn tập module”. Còn 2 lượt.',
      });
      expect(new Set(lookedUpQuizzes)).toEqual(
        new Set([practice.quizId, spent.quizId, denied.quizId]),
      );
      const passingGrade = providers.quiz.chapterAttempt80;
      expect(
        await attempts.record(
          parseContract('AttemptGradedV2Event', {
            ...passingGrade,
            eventId: randomUUID(),
            payload: {
              ...passingGrade.payload,
              attemptId: randomUUID(),
              courseId,
            },
          }),
        ),
      ).toBe('SYNCED');
      const unlocked = await list();
      expect(unlocked.total).toBe(4);
      expect(
        unlocked.items.map(({ lessonId, learningItemId }) => [
          lessonId,
          learningItemId,
        ]),
      ).toEqual([
        [first.id, null],
        [first.id, practice.itemId],
        [laterInChapter.id, null],
        [second.id, null],
      ]);

      await request(app!.getHttpServer())
        .put(`/api/v1/learning/items/${second.items[0].id}/completion`)
        .set('X-Mock-User', 'studentB')
        .send({ completed: true, contentVersion })
        .expect(200);
      expect((await list()).items.at(-1)?.learningItemId).toBe(
        nextPractice.itemId,
      );

      quizError = 'wrong-user';
      await get().expect(503);
      quizError = 'wrong-version';
      await get().expect(503);
      quizError = 'timeout';
      await get().expect(504);
      quizError = 'missing';
      expect((await list()).total).toBe(3);
      quizError = null;
      expect(requestedSnapshots.length).toBeGreaterThan(0);
      expect(new Set(requestedSnapshots)).toEqual(
        new Set([String(contentVersion)]),
      );

      includeMappings = false;
      expect(
        (await list()).items.map(({ learningItemId }) => learningItemId),
      ).toEqual([practice.itemId, nextPractice.itemId]);
      includeMappings = true;
      status = 'CANCELLED';
      expect(await list()).toEqual(empty);
      status = enrollment.status;
      available = false;
      await get().expect(409);
    }, 20000);

    it('ADP-02/03 rejects invalid nested Course records before consulting Quiz', async () => {
      for (const scenario of [
        'foreign-item',
        'wrong-version-item',
        'wrong-parent',
      ] as const) {
        snapshotCase = scenario;
        await get().expect(503);
      }
      expect(lookedUpQuizzes).toEqual([]);
    });

    it('stops reading enrollments when Course reports an incomplete page', async () => {
      inconsistentEnrollmentPage = true;
      await get().expect(503);
      expect(enrollmentPages).toEqual(['1']);
      expect(requestedSnapshots).toEqual([]);
      expect(lookedUpQuizzes).toEqual([]);
    });

    it('ADP-01/02/03 ignores future grades for skill evidence and chapter access', async () => {
      const [few, more] = fixture.attempts;
      expect(await record(few)).toBe('SYNCED');
      expect(await record(more)).toBe('SYNCED');
      await request(app!.getHttpServer())
        .put(`/api/v1/learning/items/${video.id}/completion`)
        .set('X-Mock-User', 'studentB')
        .send({ completed: true, contentVersion })
        .expect(200);
      const initial = await list();
      expect(initial.total).toBe(3);
      const gradedAt = new Date(Date.now() + 7 * 86400000).toISOString();
      for (const template of [
        providers.quiz.attemptGraded,
        providers.quiz.chapterAttempt80,
      ]) {
        expect(
          await attempts.record(
            parseContract('AttemptGradedV2Event', {
              ...template,
              eventId: randomUUID(),
              occurredAt: gradedAt,
              payload: {
                ...template.payload,
                attemptId: randomUUID(),
                courseId,
                gradedAt,
                ...(template === providers.quiz.attemptGraded
                  ? {
                      score: 100,
                      maxScore: 100,
                      passed: true,
                      skillScores: [
                        {
                          skillId,
                          score: 100,
                          maxScore: 100,
                          questionCount: 8,
                        },
                      ],
                    }
                  : {}),
              },
            }),
          ),
        ).toBe('SYNCED');
      }
      expect(await list()).toEqual(initial);
      expect(lookedUpQuizzes).not.toContain(nextPractice.quizId);
    });

    it('ADP-04 only recommends one placement for the same quiz version irrespective of UUID case', async () => {
      snapshotCase = 'duplicate-quiz';
      const [few, more] = fixture.attempts;
      expect(await record(few)).toBe('SYNCED');
      expect(await record(more)).toBe('SYNCED');
      await request(app!.getHttpServer())
        .put(`/api/v1/learning/items/${video.id}/completion`)
        .set('X-Mock-User', 'studentB')
        .send({ completed: true, contentVersion })
        .expect(200);
      const data = await list();
      expect(
        data.items.filter(({ learningItemId }) => learningItemId !== null),
      ).toMatchObject([{ learningItemId: practice.itemId }]);
      expect(
        lookedUpQuizzes.filter((id) => id === practice.quizId),
      ).toHaveLength(1);
    });

    it('ADP-02/03 keeps the next chapter locked when Course varies chapter UUID casing', async () => {
      snapshotCase = 'mixed-chapter-case';
      const [few, more] = fixture.attempts;
      expect(await record(few)).toBe('SYNCED');
      expect(await record(more)).toBe('SYNCED');
      await request(app!.getHttpServer())
        .put(`/api/v1/learning/items/${video.id}/completion`)
        .set('X-Mock-User', 'studentB')
        .send({ completed: true, contentVersion })
        .expect(200);
      const current = await list();
      expect(current.items.some(({ lessonId }) => lessonId === second.id)).toBe(
        false,
      );
      expect(lookedUpQuizzes).not.toContain(nextPractice.quizId);
    });

    it.each([
      'unknown-chapter-policy',
      'duplicate-chapter-policy',
      'item-from-other-chapter',
      'unknown-course-item',
    ] as const)(
      'ADP-02/03 rejects a malformed completion policy: %s',
      async (scenario) => {
        const [few, more] = fixture.attempts;
        expect(await record(few)).toBe('SYNCED');
        expect(await record(more)).toBe('SYNCED');
        await request(app!.getHttpServer())
          .put(`/api/v1/learning/items/${video.id}/completion`)
          .set('X-Mock-User', 'studentB')
          .send({ completed: true, contentVersion })
          .expect(200);
        snapshotCase = scenario;
        const response = await get();
        const nextChapter =
          response.body.data?.items.some(
            ({ lessonId }: { lessonId: string }) => lessonId === second.id,
          ) ?? false;
        expect({ status: response.status, nextChapter }).toEqual({
          status: 503,
          nextChapter: false,
        });
        expect(lookedUpQuizzes).toEqual([]);
      },
    );

    it('ADP-06 validates graph writes and replaces dependent recommendations with their prerequisites', async () => {
      const path = `/api/v1/learning/courses/${courseId}/skill-prerequisites`;
      const read = (actor = 'instructorA') =>
        request(app!.getHttpServer()).get(path).set('X-Mock-User', actor);
      const save = (body: unknown, actor = 'instructorA') =>
        request(app!.getHttpServer())
          .put(path)
          .set('X-Mock-User', actor)
          .send(body as object);
      const edge = { skillId, prerequisiteSkillId: secondSkillId };
      await read('studentB').expect(403);
      await read('instructorB').expect(403);
      expect((await read('adminA').expect(200)).body.data).toEqual({
        courseId,
        version: 0,
        edges: [],
      });
      await save({
        expectedVersion: 0,
        edges: [{ skillId, prerequisiteSkillId: skillId }],
      }).expect(400);
      await save({
        expectedVersion: 0,
        edges: [edge, { skillId: secondSkillId, prerequisiteSkillId: skillId }],
      }).expect(400);
      await save({
        expectedVersion: 0,
        edges: [edge, { ...edge, skillId: skillId.toUpperCase() }],
      }).expect(400);
      await save({
        expectedVersion: 0,
        edges: [{ skillId, prerequisiteSkillId: randomUUID() }],
      }).expect(422);
      const competing = await Promise.all([
        save({ expectedVersion: 0, edges: [edge] }),
        save({ expectedVersion: 0, edges: [edge] }),
      ]);
      expect(
        competing.map(({ status }) => status).sort((a, b) => a - b),
      ).toEqual([200, 409]);
      expect((await read().expect(200)).body.data).toEqual({
        courseId,
        version: 1,
        edges: [edge],
      });

      const [few, more] = fixture.attempts;
      await record(few);
      await record(more);
      expect((await list()).items).toMatchObject([
        {
          lessonId: first.id,
          reason: 'SKILL_PREREQUISITE',
          explanation: expect.stringContaining(
            'Củng cố kỹ năng Kỹ năng bổ trợ khác trước khi ôn Tổ chức module',
          ),
        },
      ]);
      const template = providers.quiz.attemptGraded;
      const gradedAt = new Date().toISOString();
      expect(
        await attempts.record(
          parseContract('AttemptGradedV2Event', {
            ...template,
            eventId: randomUUID(),
            occurredAt: gradedAt,
            payload: {
              ...template.payload,
              courseId,
              attemptId: randomUUID(),
              gradedAt,
              score: 100,
              maxScore: 200,
              passed: false,
              skillScores: [
                { skillId, score: 0, maxScore: 100, questionCount: 5 },
                {
                  skillId: secondSkillId,
                  score: 100,
                  maxScore: 100,
                  questionCount: 5,
                },
              ],
            },
          }),
        ),
      ).toBe('SYNCED');
      expect((await list()).items[0]).toMatchObject({
        lessonId: first.id,
        reason: 'LOW_MASTERY',
        explanation: expect.stringContaining('Kỹ năng Tổ chức module'),
      });
      expect((await read().expect(200)).body.data.version).toBe(1);
      await save({ expectedVersion: 1, edges: [] }).expect(200);
      expect((await list()).items[0].reason).toBe('LOW_MASTERY');
    }, 20000);

    it('ADP-07 keeps the direction of grades activated together by a quiz migration', async () => {
      const quizId = providers.quiz.attemptGraded.payload.quizId;
      const previous = first.items.find(
        (item) => item.type === 'QUIZ' && item.quizId === quizId,
      )!;
      const version =
        providers.quiz.attemptGraded.payload.assessmentVersion + 1;
      const contentVersionAfterMigration = contentVersion + 1;
      const targetItemId = randomUUID();
      for (const attempt of fixture.attempts.filter(({ daysAgo }) => daysAgo))
        expect(await record(attempt, userId, 6, version)).toBe('SYNCED');

      expect((await list()).items).toEqual([]);
      await source!.getRepository(CourseItemMigration).insert({
        courseId,
        revisionId: randomUUID(),
        targetItemId,
        policy: 'REQUIRE_RECOMPLETION',
        contentVersion: contentVersionAfterMigration,
        generation: 1,
        reason: 'Quiz revised',
        context: {
          item: {
            ...previous,
            id: targetItemId,
            contentVersion: contentVersionAfterMigration,
            type: 'QUIZ',
            quizId,
            assessmentVersion: version,
          },
          previousItems: [previous],
          requiredAssessment: {
            quizId,
            assessmentVersion: version,
            passingScorePercent: 70,
          },
        },
      });
      expect((await list()).items[0].explanation).toContain(
        'giảm 42 điểm phần trăm',
      );
    }, 20000);

    it('ADP-07 prioritizes a declining skill using four recent attempts and keeps the mastery score', async () => {
      const recent = fixture.attempts.filter(({ daysAgo }) => daysAgo);
      for (const attempt of recent.slice(0, 3))
        expect(await record(attempt, userId, 6)).toBe('SYNCED');
      expect(await record(recent[3], userId, 6, 999)).toBe('SYNCED');
      expect((await list()).items[0].explanation).toContain(
        'Kỹ năng bổ trợ khác',
      );
      expect(await record(recent[3], userId, 6)).toBe('SYNCED');
      expect((await list()).items[0].explanation).toContain(
        'giảm 42 điểm phần trăm',
      );
      const mastery = await request(app!.getHttpServer())
        .get(`/api/v1/learning/courses/${courseId}/mastery`)
        .set('X-Mock-User', 'studentB')
        .expect(200);
      expect(parseContract('MasteryData', mastery.body.data).skills).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            skillId,
            scorePercent: expect.closeTo(34, 8),
          }),
        ]),
      );
    }, 20000);
  },
);
