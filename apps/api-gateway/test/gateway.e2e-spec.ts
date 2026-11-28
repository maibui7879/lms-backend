import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { generateKeyPairSync, sign } from 'node:crypto';
import {
  createServer,
  request,
  type IncomingHttpHeaders,
  type Server,
  type RequestListener,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server as SocketServer } from 'socket.io';
import { io } from 'socket.io-client';
import { AppModule } from '../src/app.module';
import { configureGateway } from '../src/bootstrap/configure-gateway';

const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const envNames = [
  'IDENTITY_URL',
  'COURSE_URL',
  'QUIZ_URL',
  'LEARNING_URL',
  'NOTIFICATION_URL',
  'JWT_PUBLIC_KEY',
  'PROXY_TIMEOUT_MS',
  'PROXY_RETRIES',
] as const;
type Seen = {
  method: string | undefined;
  url: string | undefined;
  headers: IncomingHttpHeaders;
  body: Buffer;
};
type Reply = { status: number; headers: IncomingHttpHeaders; body: Buffer };

function bearer(role = 'STUDENT'): string {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(
    JSON.stringify({ alg: 'RS256', typ: 'JWT' }),
  ).toString('base64url');
  const claims = Buffer.from(
    JSON.stringify({
      sub: '11111111-1111-4111-8111-111111111111',
      email: 'student@example.com',
      role,
      iss: 'identity-service',
      iat: now,
      exp: now + 300,
    }),
  ).toString('base64url');
  const data = `${header}.${claims}`;
  return `Bearer ${data}.${sign('RSA-SHA256', Buffer.from(data), keys.privateKey).toString('base64url')}`;
}

describe('Gateway proxy (local upstreams)', () => {
  let app: INestApplication | undefined;
  let base: string;
  let servers: Server[];
  let seen: Record<string, Seen[]>;
  let handlers: Record<string, RequestListener>;
  let original: Record<string, string | undefined>;
  let sockets: SocketServer | undefined;

  async function listen(server: Server): Promise<string> {
    servers.push(server);
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        server.off('error', reject);
        resolve();
      });
    });
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }

  function send(
    path: string,
    method = 'GET',
    body?: string | Buffer,
    headers: IncomingHttpHeaders = {},
  ): Promise<Reply> {
    return new Promise((resolve, reject) => {
      const req = request(new URL(path, base), { method, headers }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('error', reject);
        res.on('end', () =>
          resolve({
            status: res.statusCode!,
            headers: res.headers,
            body: Buffer.concat(chunks),
          }),
        );
      });
      req.on('error', reject);
      req.setTimeout(4000, () =>
        req.destroy(new Error('Test client timed out')),
      );
      req.end(body);
    });
  }

  beforeEach(async () => {
    servers = [];
    seen = {};
    handlers = {};
    original = Object.fromEntries(
      envNames.map((name) => [name, process.env[name]]),
    );
    process.env.JWT_PUBLIC_KEY = keys.publicKey
      .export({ type: 'spki', format: 'pem' })
      .toString();
    process.env.PROXY_TIMEOUT_MS = '150';
    delete process.env.PROXY_RETRIES; // Exercise the default single retry.
    for (const service of [
      'identity',
      'course',
      'quiz',
      'learning',
      'notification',
    ]) {
      seen[service] = [];
      process.env[`${service.toUpperCase()}_URL`] = await listen(
        createServer((req, res) => {
          const chunks: Buffer[] = [];
          req.on('data', (chunk: Buffer) => chunks.push(chunk));
          req.on('end', () => {
            seen[service].push({
              method: req.method,
              url: req.url,
              headers: req.headers,
              body: Buffer.concat(chunks),
            });
            if (handlers[service]) handlers[service](req, res);
            else {
              res.setHeader('content-type', 'application/json');
              res.end(JSON.stringify({ service }));
            }
          });
        }),
      );
    }
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication({ bodyParser: false });
    app.useLogger(false);
    await configureGateway(app);
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  });

  afterEach(async () => {
    if (sockets)
      await new Promise<void>((resolve) => sockets!.close(() => resolve()));
    sockets = undefined;
    await app?.close();
    app = undefined;
    await Promise.all(
      servers.map(
        (server) =>
          new Promise<void>((resolve, reject) => {
            if (!server.listening) {
              resolve();
              return;
            }
            server.close((error) => (error ? reject(error) : resolve()));
            server.closeAllConnections();
          }),
      ),
    );
    for (const name of envNames) {
      if (original[name] === undefined) delete process.env[name];
      else process.env[name] = original[name];
    }
  });

  it('routes public course queries unchanged and strips spoofed and hop headers', async () => {
    const path = '/api/v1/courses?search=a%2Bb&tag=one&tag=two';
    const response = await send(path, 'GET', undefined, {
      'x-request-id': 'test-request_123',
      'x-mock-user': 'admin',
      'x-user-id': 'forged',
      'x-user-role': 'ADMIN',
      connection: 'keep-alive, x-private-hop',
      'x-private-hop': 'secret',
      'keep-alive': 'timeout=20',
    });
    expect(response.status).toBe(200);
    expect(JSON.parse(response.body.toString())).toEqual({ service: 'course' });
    expect(response.headers['x-request-id']).toBe('test-request_123');
    expect(seen.course[0].url).toBe(path);
    expect(seen.course[0].headers['x-request-id']).toBe('test-request_123');
    for (const name of [
      'x-mock-user',
      'x-user-id',
      'x-user-role',
      'x-private-hop',
      'keep-alive',
    ])
      expect(seen.course[0].headers[name]).toBeUndefined();
    expect(seen.identity).toHaveLength(0);
  });

  it('streams raw login JSON bytes and replaces an invalid request id consistently', async () => {
    const raw =
      ' { "email" : "fixture@example.test", "password": "local-only" }\n';
    const response = await send('/api/v1/auth/login', 'POST', raw, {
      'content-type': 'application/json',
      'x-request-id': 'invalid id',
    });
    expect(response.status).toBe(200);
    expect(seen.identity[0].body).toEqual(Buffer.from(raw));
    expect(seen.identity[0].method).toBe('POST');
    expect(response.headers['x-request-id']).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(seen.identity[0].headers['x-request-id']).toBe(
      response.headers['x-request-id'],
    );
  });

  it('routes Identity controller APIs outside the contract and rejects planned Quiz APIs', async () => {
    const authorization = bearer();
    for (const [path, method, body] of [
      [
        '/api/v1/auth/verify-email',
        'POST',
        '{"email":"test@example.com","otp":"123456"}',
      ],
      [
        '/api/v1/users/me/password',
        'POST',
        '{"currentPassword":"old","newPassword":"new"}',
      ],
      ['/api/v1/users/me', 'GET', undefined],
    ] as const) {
      const response = await send(path, method, body, { authorization });
      expect(response.status).toBe(200);
      expect(seen.identity.at(-1)?.url).toBe(path);
    }
    const count = seen.quiz.length;
    expect(
      (await send('/api/v1/quizzes', 'POST', '{}', { authorization })).status,
    ).toBe(404);
    expect(
      (
        await send('/api/v1/courses/id/assessments', 'GET', undefined, {
          authorization,
        })
      ).status,
    ).toBe(404);
    expect(seen.quiz).toHaveLength(count);
  });

  it.each([undefined, 'Bearer malformed', bearer().replace(/.$/, '!')])(
    'rejects missing or invalid JWT before upstream: %s',
    async (authorization) => {
      const response = await send(
        '/api/v1/notifications',
        'GET',
        undefined,
        authorization ? { authorization } : {},
      );
      expect(response.status).toBe(401);
      expect(seen.notification).toHaveLength(0);
    },
  );

  it('forwards a signed JWT and leaves role authorization to identity', async () => {
    const authorization = bearer();
    expect(
      (await send('/api/v1/notifications', 'GET', undefined, { authorization }))
        .status,
    ).toBe(200);
    expect(seen.notification[0].headers.authorization).toBe(authorization);
    handlers.identity = (_req, res) => {
      res.statusCode = 403;
      res.end('downstream role decision');
    };
    const response = await send('/api/v1/admin/users', 'GET', undefined, {
      authorization,
    });
    expect(response.status).toBe(403);
    expect(response.body.toString()).toBe('downstream role decision');
    expect(seen.identity).toHaveLength(1);
  });

  it.each([
    '/api/v1/internal/users/11111111-1111-4111-8111-111111111111',
    '/api/v1/unknown',
  ])('rejects %s before upstream', async (path) => {
    expect(
      (await send(path, 'GET', undefined, { authorization: bearer() })).status,
    ).toBe(404);
    expect(Object.values(seen).flat()).toHaveLength(0);
  });

  it.each(['google', 'google/callback', 'github', 'github/callback'])(
    'proxies identity OAuth route %s',
    async (path) => {
      handlers.identity = (_req, res) => {
        res.writeHead(302, {
          location: '/fixture/redirect',
          'set-cookie': ['first=1; HttpOnly', 'second=2; SameSite=Lax'],
        });
        res.end();
      };
      const response = await send(`/api/v1/auth/${path}?code=local-code`);
      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('/fixture/redirect');
      expect(response.headers['set-cookie']).toEqual([
        'first=1; HttpOnly',
        'second=2; SameSite=Lax',
      ]);
      expect(seen.identity[0].url).toBe(`/api/v1/auth/${path}?code=local-code`);
    },
  );

  it('passes a 409 response body and status unchanged without retry', async () => {
    const body = '{"error":{"code":"FIXTURE_CONFLICT","details":{"value":42}}}';
    handlers.course = (_req, res) => {
      res.writeHead(409, { 'content-type': 'application/json' });
      res.end(body);
    };
    const response = await send('/api/v1/courses');
    expect(response.status).toBe(409);
    expect(response.body.toString()).toBe(body);
    expect(seen.course).toHaveLength(1);
  });

  it('preserves a bodyless 204', async () => {
    handlers.identity = (_req, res) => {
      res.writeHead(204);
      res.end();
    };
    const response = await send('/api/v1/auth/logout', 'POST', undefined, {
      authorization: bearer(),
    });
    expect(response.status).toBe(204);
    expect(response.body.length).toBe(0);
  });

  it('preserves PDF bytes and download headers', async () => {
    const pdf = Buffer.from('%PDF-1.7\n\x00\xff\n%%EOF', 'latin1');
    handlers.learning = (_req, res) => {
      res.writeHead(200, {
        'content-type': 'application/pdf',
        'content-disposition': 'attachment; filename="fixture.pdf"',
      });
      res.end(pdf);
    };
    const response = await send(
      '/api/v1/learning/me/certificates/fixture/download',
      'GET',
      undefined,
      { authorization: bearer() },
    );
    expect(response.status).toBe(200);
    expect(response.body).toEqual(pdf);
    expect(response.headers['content-type']).toBe('application/pdf');
    expect(response.headers['content-disposition']).toBe(
      'attachment; filename="fixture.pdf"',
    );
  });

  it('retries GET 500 once and returns the successful response', async () => {
    handlers.course = (_req, res) => {
      res.statusCode = seen.course.length === 1 ? 500 : 200;
      res.end('fixture');
    };
    expect((await send('/api/v1/courses')).status).toBe(200);
    expect(seen.course).toHaveLength(2);
  });

  it('bounds GET retries to one and does not retry POST 500', async () => {
    handlers.course = (_req, res) => {
      res.statusCode = 500;
      res.end('course unavailable');
    };
    expect((await send('/api/v1/courses')).status).toBe(500);
    expect(seen.course).toHaveLength(2);
    handlers.identity = (_req, res) => {
      res.statusCode = 500;
      res.end('identity unavailable');
    };
    const response = await send('/api/v1/auth/login', 'POST', '{}', {
      'content-type': 'application/json',
    });
    expect(response.status).toBe(500);
    expect(response.body.toString()).toBe('identity unavailable');
    expect(seen.identity).toHaveLength(1);
  });

  it('retries a safe GET after a network failure', async () => {
    handlers.course = (req, res) => {
      if (seen.course.length === 1) req.socket.destroy();
      else res.end('recovered');
    };
    const response = await send('/api/v1/courses');
    expect(response.status).toBe(200);
    expect(response.body.toString()).toBe('recovered');
    expect(seen.course).toHaveLength(2);
  });

  it('returns 503 for a refused upstream connection', async () => {
    const unused = createServer();
    process.env.COURSE_URL = await listen(unused);
    await new Promise<void>((resolve, reject) =>
      unused.close((error) => (error ? reject(error) : resolve())),
    );
    expect((await send('/api/v1/courses')).status).toBe(503);
  });

  it('returns 504 when an upstream does not respond', async () => {
    handlers.course = () => {
      /* Deliberately leave the fixture response open. */
    };
    expect((await send('/api/v1/courses')).status).toBe(504);
    expect(seen.course).toHaveLength(1);
  });

  it('forwards a real Socket.IO websocket connection and notification event', async () => {
    const upstream = createServer();
    sockets = new SocketServer(upstream, { transports: ['websocket'] });
    sockets.of('/notifications').on('connection', (socket) => {
      socket.on('fixture:request', () =>
        socket.emit('notification', { id: 'fixture-event' }),
      );
    });
    process.env.NOTIFICATION_URL = await listen(upstream);
    const client = io(`${base}/notifications`, {
      transports: ['websocket'],
      reconnection: false,
      timeout: 2000,
    });
    try {
      const event = await new Promise<unknown>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error('Socket.IO event timed out')),
          3000,
        );
        const finish = (error: Error | null, value?: unknown) => {
          clearTimeout(timer);
          if (error) reject(error);
          else resolve(value);
        };
        client.once('connect_error', (error) => finish(error));
        client.once('notification', (value: unknown) => finish(null, value));
        client.once('connect', () => client.emit('fixture:request'));
      });
      expect(event).toEqual({ id: 'fixture-event' });
      expect(client.io.engine.transport.name).toBe('websocket');
    } finally {
      client.disconnect();
    }
  });
});
