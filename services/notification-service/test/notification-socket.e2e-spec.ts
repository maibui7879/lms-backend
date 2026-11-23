import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { generateKeyPairSync, sign } from 'node:crypto';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { NotificationAuthGuard } from '../src/auth/notification-auth.guard';
import { NotificationsGateway } from '../src/modules/notifications/gateways/notifications.gateway';
import type { CourseNotificationData } from '@lms/contracts';

describe('Standalone notification Socket.IO transport', () => {
  let app: INestApplication;
  const previous = { ...process.env };
  const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const owner = '11111111-1111-4111-8111-111111111111';
  const other = '22222222-2222-4222-8222-222222222222';
  const clients: Socket[] = [];
  function token(sub: string) {
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString(
      'base64url',
    );
    const payload = Buffer.from(
      JSON.stringify({
        sub,
        email: 'test@example.com',
        role: 'STUDENT',
        iss: 'identity-service',
        iat: now,
        exp: now + 60,
      }),
    ).toString('base64url');
    const input = `${header}.${payload}`;
    return `${input}.${sign('RSA-SHA256', Buffer.from(input), keys.privateKey).toString('base64url')}`;
  }
  async function connect(accessToken: string) {
    const client = io((await app.getUrl()) + '/notifications', {
      transports: ['websocket'],
      reconnection: false,
      autoConnect: false,
      auth: { accessToken },
    });
    clients.push(client);
    await new Promise<void>((resolve, reject) => {
      client.once('connect', resolve);
      client.once('connect_error', reject);
      client.connect();
    });
    return client;
  }
  beforeAll(async () => {
    process.env.JWT_PUBLIC_KEY = keys.publicKey
      .export({ type: 'spki', format: 'pem' })
      .toString();
    process.env.IDENTITY_INTERNAL_JWT_PRIVATE_KEY = keys.privateKey
      .export({ type: 'pkcs8', format: 'pem' })
      .toString();
    process.env.IDENTITY_URL = 'http://identity.test';
    jest.spyOn(globalThis, 'fetch').mockImplementation(
      async (input) =>
        ({
          ok: true,
          json: async () => ({
            data: {
              userId: new URL(
                input instanceof Request ? input.url : input,
              ).pathname.split('/')[5],
              role: 'STUDENT',
              status: 'ACTIVE',
            },
          }),
        }) as Response,
    );
    const module = await Test.createTestingModule({
      providers: [NotificationAuthGuard, NotificationsGateway],
    }).compile();
    app = module.createNestApplication();
    await app.listen(0, '127.0.0.1');
  });
  afterAll(async () => {
    for (const client of clients) client.disconnect();
    await app.close();
    jest.restoreAllMocks();
    process.env = previous;
  });
  it('delivers only to the recipient and disconnects invalid credentials', async () => {
    const recipient = await connect(token(owner));
    const unrelated = await connect(token(other));
    const invalid = await connect('mock-student');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(invalid.connected).toBe(false);
    const unrelatedReceived = jest.fn();
    unrelated.on('notification.created', unrelatedReceived);
    const received = new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('Notification timeout')),
        2000,
      );
      recipient.once('notification.created', (value) => {
        clearTimeout(timeout);
        resolve(value);
      });
    });
    const data: CourseNotificationData = {
      id: owner,
      courseId: owner,
      revisionId: null,
      type: 'COURSE_APPROVED',
      title: 'Approved',
      message: 'Published',
      createdAt: new Date().toISOString(),
      readAt: null,
    };
    await app.get(NotificationsGateway).publish(data, owner);
    expect(await received).toEqual({
      data,
      meta: { requestId: expect.any(String) },
    });
    expect(unrelatedReceived).not.toHaveBeenCalled();
    jest.mocked(fetch).mockRejectedValueOnce(new Error('Identity unavailable'));
    const disconnected = new Promise<void>((resolve) =>
      recipient.once('disconnect', () => resolve()),
    );
    await app.get(NotificationsGateway).publish(data, owner);
    await disconnected;
    expect(recipient.connected).toBe(false);
  });
});
