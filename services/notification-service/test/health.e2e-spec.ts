import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { HealthController } from '../src/health/health.controller';
import { NotificationEventsConsumer } from '../src/modules/notifications/consumers/notification-events.consumer';

describe('notification health endpoints', () => {
  let app: INestApplication;
  const database = { query: jest.fn() };
  const broker = { isConnected: true };
  const originalBrokerUrl = process.env.RABBITMQ_URL;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: DataSource, useValue: database },
        { provide: NotificationEventsConsumer, useValue: broker },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  beforeEach(() => {
    database.query.mockReset().mockResolvedValue([]);
    broker.isConnected = true;
    delete process.env.RABBITMQ_URL;
  });

  afterAll(async () => {
    await app.close();
    if (originalBrokerUrl === undefined) delete process.env.RABBITMQ_URL;
    else process.env.RABBITMQ_URL = originalBrokerUrl;
  });

  it('reports liveness without authentication or dependency checks', async () => {
    database.query.mockRejectedValue(new Error('unavailable'));
    await request(app.getHttpServer()).get('/health/live').expect(200).expect({
      status: 'ok',
      service: 'notification-service',
    });
    expect(database.query).not.toHaveBeenCalled();
  });

  it('reports readiness when dependencies are available', async () => {
    await request(app.getHttpServer()).get('/health').expect(200).expect({
      status: 'ok',
      service: 'notification-service',
      database: 'up',
      broker: 'disabled',
    });
    expect(database.query).toHaveBeenCalledWith(
      'SELECT 1 FROM notification.notifications LIMIT 1',
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

  it('returns 503 when a configured broker is disconnected', async () => {
    process.env.RABBITMQ_URL = 'amqp://localhost';
    broker.isConnected = false;
    await request(app.getHttpServer()).get('/health').expect(503);
  });

  it('reports a connected configured broker', async () => {
    process.env.RABBITMQ_URL = 'amqp://localhost';
    const result = await request(app.getHttpServer())
      .get('/health')
      .expect(200);
    expect(result.body.broker).toBe('up');
  });
});
