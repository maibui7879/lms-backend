import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { RevisionMetadataController } from '../src/modules/revision-metadata/revision-metadata.controller';
import { RevisionMetadataService } from '../src/modules/revision-metadata/revision-metadata.service';

describe('revision metadata HTTP boundary', () => {
  let app: INestApplication;
  const metadata = {
    changes: jest.fn(),
    notices: jest.fn(),
    read: jest.fn(),
    context: jest.fn(),
  };
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.MOCK_AUTH = 'true';
    process.env.COURSE_SERVICE_TOKEN = 'test-internal-token';
    const module = await Test.createTestingModule({
      controllers: [RevisionMetadataController],
      providers: [{ provide: RevisionMetadataService, useValue: metadata }],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(async () => app.close());
  const id = '11111111-1111-4111-8111-111111111111';
  it('rejects anonymous and malformed owner list requests', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/course-revisions/${id}/changes`)
      .expect(401);
    await request(app.getHttpServer())
      .get(`/api/v1/course-revisions/${id}/changes?page=2&page=3`)
      .set('x-mock-user', 'instructorA')
      .expect(400);
    expect(metadata.changes).not.toHaveBeenCalled();
  });
  it('returns paginated notices in the response envelope', async () => {
    metadata.notices.mockResolvedValue({
      items: [],
      page: 1,
      limit: 20,
      total: 0,
    });
    const response = await request(app.getHttpServer())
      .get(`/api/v1/courses/${id}/patch-notices`)
      .set('x-mock-user', 'studentA')
      .set('x-request-id', 'test-request')
      .expect(200);
    expect(response.body).toEqual({
      data: { items: [], page: 1, limit: 20, total: 0 },
      meta: { requestId: 'test-request' },
    });
  });
  it('acknowledges notice reads without a body', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/patch-notices/${id}/read`)
      .set('x-mock-user', 'studentA')
      .expect(204);
    expect(response.text).toBe('');
  });
  it('does not accept mock user credentials on the internal route', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/internal/course-revisions/${id}/item-migration-context`)
      .set('x-mock-user', 'adminA')
      .expect(401);
    expect(metadata.context).not.toHaveBeenCalled();
  });
});
