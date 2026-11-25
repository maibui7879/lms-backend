import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { HealthController } from '../src/health/health.controller';

describe('course health endpoints', () => {
  let app: INestApplication;
  const database = { query: jest.fn() };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: DataSource, useValue: database }],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  beforeEach(() => {
    database.query.mockReset().mockResolvedValue([]);
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports liveness without authentication or dependency checks', async () => {
    database.query.mockRejectedValue(new Error('unavailable'));
    await request(app.getHttpServer()).get('/health/live').expect(200).expect({
      status: 'ok',
      service: 'course-service',
    });
    expect(database.query).not.toHaveBeenCalled();
  });

  it('reports readiness when dependencies are available', async () => {
    await request(app.getHttpServer()).get('/health').expect(200).expect({
      status: 'ok',
      service: 'course-service',
      database: 'up',
    });
    expect(database.query).toHaveBeenCalledWith(
      'SELECT 1 FROM courses LIMIT 1',
    );
  });

  it('returns 503 without exposing database details', async () => {
    database.query.mockRejectedValue(new Error('secret database credentials'));
    const result = await request(app.getHttpServer())
      .get('/health')
      .expect(503);
    expect(JSON.stringify(result.body)).not.toContain(
      'secret database credentials',
    );
  });
});
