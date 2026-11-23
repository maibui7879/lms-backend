import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { generateKeyPairSync, sign } from 'node:crypto';
import request from 'supertest';
import { NotificationAuthGuard } from '../src/auth/notification-auth.guard';
import { NotificationsController } from '../src/modules/notifications/controllers/notifications.controller';
import { NotificationsService } from '../src/modules/notifications/services/notifications.service';
import { NotificationDispatcherService } from '../src/modules/notifications/services/notification-dispatcher.service';
import { NotificationsGateway } from '../src/modules/notifications/gateways/notifications.gateway';
import { Notification } from '../src/modules/notifications/entities/notification.entity';
import { requestContext } from '../src/common/request-context';
import { HttpExceptionFilter } from '../src/common/http-exception.filter';

describe('Standalone inbox with signed HTTP authentication', () => {
  let app: INestApplication;
  const previous = { ...process.env };
  const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const owner = '11111111-1111-4111-8111-111111111111';
  const other = '22222222-2222-4222-8222-222222222222';
  const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  let row: Notification;
  const repo = {
    findAndCount: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
    findOneBy: jest.fn(),
    find: jest.fn(),
  };
  const gateway = { publish: jest.fn() };
  function token(sub = owner, expiry = 60) {
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString(
      'base64url',
    );
    const payload = Buffer.from(
      JSON.stringify({
        sub,
        email: 'test@example.com',
        role: 'INSTRUCTOR',
        iss: 'identity-service',
        iat: now,
        exp: now + expiry,
      }),
    ).toString('base64url');
    const input = `${header}.${payload}`;
    return `${input}.${sign('RSA-SHA256', Buffer.from(input), keys.privateKey).toString('base64url')}`;
  }
  beforeAll(async () => {
    process.env.MOCK_AUTH = 'true';
    process.env.JWT_PUBLIC_KEY = keys.publicKey
      .export({ type: 'spki', format: 'pem' })
      .toString();
    process.env.IDENTITY_INTERNAL_JWT_PRIVATE_KEY = keys.privateKey
      .export({ type: 'pkcs8', format: 'pem' })
      .toString();
    process.env.IDENTITY_URL = 'http://identity.test';
    const module = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [
        NotificationAuthGuard,
        NotificationsService,
        NotificationDispatcherService,
        { provide: getRepositoryToken(Notification), useValue: repo },
        { provide: NotificationsGateway, useValue: gateway },
      ],
    }).compile();
    app = module.createNestApplication();
    app.use(requestContext);
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    app.get(NotificationDispatcherService).onModuleDestroy();
  });
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(globalThis, 'fetch').mockImplementation(
      async (input) =>
        ({
          ok: true,
          json: async () => ({
            data: {
              userId: new URL(
                input instanceof Request ? input.url : input,
              ).pathname.split('/')[5],
              role: 'INSTRUCTOR',
              status: 'ACTIVE',
            },
          }),
        }) as Response,
    );
    row = {
      id,
      recipientId: owner,
      courseId: id,
      revisionId: null,
      type: 'COURSE_APPROVED',
      title: 'Approved',
      message: 'Published',
      eventKey: id,
      createdAt: new Date(),
      readAt: null,
      emittedAt: null,
    };
    repo.findAndCount.mockImplementation(async ({ where }) =>
      where.recipientId === owner ? [[row], 1] : [[], 0],
    );
    repo.findOneBy.mockImplementation(async (where) =>
      where.recipientId === owner && where.id === id ? row : null,
    );
    repo.count.mockImplementation(async ({ where }) =>
      where.recipientId === owner && !row.readAt ? 1 : 0,
    );
    repo.update.mockImplementation(async (where, patch) => {
      if (
        where.id === id &&
        (!where.recipientId || where.recipientId === owner) &&
        (!where.readAt || !row.readAt)
      )
        Object.assign(row, patch);
      return { affected: 1 };
    });
    repo.find.mockImplementation(async () => (row.emittedAt ? [] : [row]));
    gateway.publish.mockResolvedValue(undefined);
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    await app.close();
    process.env = previous;
  });
  it('rejects missing, mock, malformed, expired, and tampered credentials', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/notifications')
      .set('x-mock-user', 'instructorA')
      .expect(401);
    for (const value of [
      'mock-student',
      'abc.def.ghi',
      token(owner, -1),
      token() + 'bad',
    ])
      await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${value}`)
        .expect(401);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('scopes the inbox and validates pagination and unknown fields', async () => {
    const result = await request(app.getHttpServer())
      .get('/api/v1/notifications?unreadOnly=true')
      .set('Authorization', `Bearer ${token()}`)
      .expect(200);
    expect(result.body.data.items).toHaveLength(1);
    expect(result.body.data.items[0]).not.toHaveProperty('recipientId');
    expect(result.headers['x-request-id']).toBe(result.body.meta.requestId);
    const empty = await request(app.getHttpServer())
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${token(other)}`)
      .expect(200);
    expect(empty.body.data.total).toBe(0);
    for (const query of [
      'page=0',
      'unreadOnly=invalid',
      `recipientId=${other}`,
    ])
      await request(app.getHttpServer())
        .get(`/api/v1/notifications?${query}`)
        .set('Authorization', `Bearer ${token()}`)
        .expect(400);
  });
  it('prevents cross-user writes and marks read idempotently', async () => {
    await request(app.getHttpServer())
      .put(`/api/v1/notifications/${id}/read`)
      .set('Authorization', `Bearer ${token(other)}`)
      .expect(404);
    expect(row.readAt).toBeNull();
    const first = await request(app.getHttpServer())
      .put(`/api/v1/notifications/${id}/read`)
      .set('Authorization', `Bearer ${token()}`)
      .expect(200);
    const second = await request(app.getHttpServer())
      .put(`/api/v1/notifications/${id}/read`)
      .set('Authorization', `Bearer ${token()}`)
      .expect(200);
    expect(second.body.data.readAt).toBe(first.body.data.readAt);
    const count = await request(app.getHttpServer())
      .get('/api/v1/notifications/unread-count')
      .set('Authorization', `Bearer ${token()}`)
      .expect(200);
    expect(count.body.data.count).toBe(0);
  });
  it('fails closed when Identity is inactive or unavailable', async () => {
    jest.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: { userId: owner, role: 'INSTRUCTOR', status: 'INACTIVE' },
      }),
    } as Response);
    await request(app.getHttpServer())
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${token()}`)
      .expect(403);
    jest.mocked(fetch).mockRejectedValueOnce(new Error('unavailable'));
    await request(app.getHttpServer())
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${token()}`)
      .expect(503);
  });
  it('retries persisted rows after delivery failure', async () => {
    gateway.publish.mockRejectedValueOnce(new Error('unavailable'));
    await app.get(NotificationDispatcherService).dispatch();
    expect(row.emittedAt).toBeNull();
    await app.get(NotificationDispatcherService).dispatch();
    expect(row.emittedAt).toBeInstanceOf(Date);
    await app.get(NotificationDispatcherService).dispatch();
    expect(gateway.publish).toHaveBeenCalledTimes(2);
  });
});
