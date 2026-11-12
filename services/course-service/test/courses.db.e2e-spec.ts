import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import ids from '@lms/contracts/fixtures/ids.json';
import { Course } from '../src/modules/courses/entities/course.entity';
import { Chapter } from '../src/modules/chapters/entities/chapter.entity';
import { Lesson } from '../src/modules/lessons/entities/lesson.entity';
import { seedCourse } from '../src/database/seeds/course.seed';

const testUrl = process.env.TEST_DATABASE_URL;
const suite = testUrl ? describe : describe.skip;
suite(
  'Course PostgreSQL persistence (requires dedicated *_test database)',
  () => {
    let app: INestApplication;
    let source: DataSource;
    let hadSeed = false;
    const created: string[] = [];
    const createdChapters: string[] = [];
    const createdLessons: string[] = [];
    const oldEnv = { ...process.env };
    beforeAll(async () => {
      const parsedUrl = new URL(testUrl!);
      const databaseName = parsedUrl.pathname.slice(1);
      const isLocalSupabase =
        ['127.0.0.1', 'localhost'].includes(parsedUrl.hostname) &&
        parsedUrl.port === '54322' &&
        databaseName === 'postgres';
      if (!databaseName.endsWith('_test') && !isLocalSupabase)
        throw new Error(
          'TEST_DATABASE_URL must name a disposable *_test database or Supabase local postgres',
        );
      process.env.DATABASE_URL = testUrl;
      process.env.NODE_ENV = 'development';
      process.env.MOCK_AUTH = 'true';
      process.env.DB_SYNC = 'true';
      const { AppModule } = await import('../src/app.module');
      const module = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      app = module.createNestApplication();
      await app.init();
      source = app.get(DataSource);
      hadSeed = await source
        .getRepository(Course)
        .existsBy({ id: ids.courses.draftCourse });
    }, 30000);
    afterAll(async () => {
      if (source?.isInitialized) {
        for (const id of createdChapters)
          await source.getRepository(Chapter).delete(id);
        for (const id of createdLessons)
          await source.getRepository(Lesson).delete(id);
        for (const id of created) await source.getRepository(Course).delete(id);
        if (!hadSeed)
          await source.getRepository(Course).delete(ids.courses.draftCourse);
      }
      if (app) await app.close();
      process.env = oldEnv;
    });
    it('retains hello and persists a generated course independently of the seed', async () => {
      await request(app.getHttpServer())
        .get('/')
        .expect(200)
        .expect('Hello World!');
      const result = await request(app.getHttpServer())
        .post('/api/v1/courses')
        .set('x-mock-user', 'instructorA')
        .send({ title: 'Database integration', description: 'Synthetic test' })
        .expect(201);
      created.push(result.body.data.id);
      const row = await source
        .getRepository(Course)
        .findOneByOrFail({ id: created[0] });
      expect(row.instructorId).toBe(ids.users.instructorA);
      expect(row.status).toBe('DRAFT');
      expect(row.createdAt).toBeInstanceOf(Date);
      expect(row.id).not.toBe(ids.courses.draftCourse);

      const chapter = await request(app.getHttpServer())
        .post(`/api/v1/courses/${created[0]}/chapters`)
        .set('x-mock-user', 'instructorA')
        .send({ title: 'Database chapter' })
        .expect(201);
      createdChapters.push(chapter.body.data.id);
      expect(chapter.body.data).toMatchObject({
        courseId: created[0],
        title: 'Database chapter',
        order: 1,
        version: 1,
      });

      const lesson = await request(app.getHttpServer())
        .post(`/api/v1/chapters/${chapter.body.data.id}/lessons`)
        .set('x-mock-user', 'instructorA')
        .send({ title: 'Database lesson' })
        .expect(201);
      createdLessons.push(lesson.body.data.id);
      expect(lesson.body.data).toMatchObject({
        courseId: created[0],
        chapterId: chapter.body.data.id,
        title: 'Database lesson',
        order: 1,
        version: 1,
      });
    });
    it('seeds twice without overwriting existing records or POST-created courses', async () => {
      await seedCourse(source);
      const before = await source
        .getRepository(Course)
        .findOneByOrFail({ id: ids.courses.draftCourse });
      await seedCourse(source);
      const after = await source
        .getRepository(Course)
        .findOneByOrFail({ id: ids.courses.draftCourse });
      expect(after).toEqual(before);
      expect(
        await source.getRepository(Course).existsBy({ id: created[0] }),
      ).toBe(true);
    });
  },
);
