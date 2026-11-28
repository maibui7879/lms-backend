import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { getMockUser } from '@lms/auth';
import type { ExecutionContext } from '@nestjs/common';
import { CourseAuthGuard } from '../src/common/course-auth.guard';
import { ChaptersController } from '../src/modules/chapters/chapters.controller';
import { ChaptersService } from '../src/modules/chapters/chapters.service';
import { LessonsController } from '../src/modules/lessons/lessons.controller';
import { LessonsService } from '../src/modules/lessons/lessons.service';
import { LearningItemsController } from '../src/modules/learning-items/learning-items.controller';
import { LearningItemsService } from '../src/modules/learning-items/learning-items.service';

describe('Revision delete and reorder HTTP validation', () => {
  let app: INestApplication;
  const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const revisionId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const chapters = {
    remove: jest.fn(),
    reorder: jest.fn().mockResolvedValue({}),
  };
  const lessons = {
    remove: jest.fn(),
    reorder: jest.fn().mockResolvedValue([]),
  };
  const items = { remove: jest.fn(), reorder: jest.fn().mockResolvedValue({}) };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [
        ChaptersController,
        LessonsController,
        LearningItemsController,
      ],
      providers: [
        { provide: ChaptersService, useValue: chapters },
        { provide: LessonsService, useValue: lessons },
        { provide: LearningItemsService, useValue: items },
      ],
    })
      .overrideGuard(CourseAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest().user = getMockUser('instructorA');
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    await app.init();
  });
  beforeEach(() => jest.clearAllMocks());
  afterAll(async () => app.close());

  for (const [path, service] of [
    [`/api/v1/chapters/${id}`, chapters],
    [`/api/v1/lessons/${id}`, lessons],
    [`/api/v1/learning-items/${id}`, items],
  ] as const) {
    it(`accepts revisionId for DELETE ${path}`, async () => {
      const payload = { expectedVersion: 1, revisionId };
      await request(app.getHttpServer()).delete(path).send(payload).expect(204);
      expect(service.remove).toHaveBeenCalledWith(
        id,
        payload,
        getMockUser('instructorA'),
      );
      await request(app.getHttpServer())
        .delete(path)
        .send({ ...payload, revisionId: 'invalid' })
        .expect(400);
      await request(app.getHttpServer())
        .delete(path)
        .send({ ...payload, unexpected: true })
        .expect(400);
      expect(service.remove).toHaveBeenCalledTimes(1);
    });
  }
  for (const [path, service] of [
    [`/api/v1/courses/${id}/chapters/order`, chapters],
    [`/api/v1/chapters/${id}/lessons/order`, lessons],
    [`/api/v1/lessons/${id}/items/order`, items],
  ] as const) {
    it(`accepts revisionId for PUT ${path}`, async () => {
      const payload = { expectedVersion: 1, revisionId, orderedIds: [id] };
      await request(app.getHttpServer()).put(path).send(payload).expect(200);
      expect(service.reorder).toHaveBeenCalledWith(
        id,
        payload,
        getMockUser('instructorA'),
      );
      await request(app.getHttpServer())
        .put(path)
        .send({ ...payload, revisionId: 'invalid' })
        .expect(400);
      await request(app.getHttpServer())
        .put(path)
        .send({ ...payload, orderedIds: [id, id] })
        .expect(400);
      expect(service.reorder).toHaveBeenCalledTimes(1);
    });
  }
});
