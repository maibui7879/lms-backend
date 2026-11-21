import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { parseContract } from '@lms/contracts';
import { CourseClient } from '../src/integrations/course.client';
import providers from './fixtures/learning-providers.mock.json';

const enrollment = parseContract(
  'EnrollmentSnapshotData',
  providers.course.enrollment,
);
const requestContext = {
  userId: enrollment.userId,
  mockUser: 'studentB',
  requestId: 'pinned-snapshot-test',
};
const expectedPath = `/api/v1/internal/courses/${enrollment.courseId}/structure?contentVersion=${enrollment.contentVersion}`;
const token = 'fixture-course-internal-token';

describe('Learning reads the pinned Course snapshot through the internal HTTP API', () => {
  let server: Server;
  let courseUrl: string;
  let status = 200;
  let response = structuredClone(providers.course.structure);
  const previousEnv = { ...process.env };
  const received: {
    path: string | undefined;
    authorization: string | undefined;
    mockUser: string | string[] | undefined;
    requestId: string | string[] | undefined;
  }[] = [];
  const client = new CourseClient();

  beforeAll(async () => {
    server = createServer((req, res) => {
      received.push({
        path: req.url,
        authorization: req.headers.authorization,
        mockUser: req.headers['x-mock-user'],
        requestId: req.headers['x-request-id'],
      });
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: response }));
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    courseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  beforeEach(() => {
    status = 200;
    response = structuredClone(providers.course.structure);
    received.length = 0;
    process.env.COURSE_URL = courseUrl;
    process.env.COURSE_SERVICE_TOKEN = `  ${token}  `;
  });

  afterAll(async () => {
    if (server?.listening)
      await new Promise<void>((resolve) => server.close(() => resolve()));
    process.env = previousEnv;
  });

  it('requests the exact enrolled version in a single authenticated internal call', async () => {
    expect(await client.structure(enrollment, requestContext)).toEqual(
      providers.course.structure,
    );
    expect(received).toEqual([
      {
        path: expectedPath,
        authorization: `Bearer ${token}`,
        mockUser: undefined,
        requestId: requestContext.requestId,
      },
    ]);
  });

  it('requires a service credential before making a structure request', async () => {
    delete process.env.COURSE_SERVICE_TOKEN;
    await expect(
      client.structure(enrollment, requestContext),
    ).rejects.toMatchObject({ status: 503 });
    expect(received).toEqual([]);
  });

  it.each(['outline', 'completionPolicy'] as const)(
    'rejects a %s from another content version',
    async (part) => {
      response[part].contentVersion = enrollment.contentVersion + 1;
      await expect(
        client.structure(enrollment, requestContext),
      ).rejects.toMatchObject({ status: 409 });
      expect(received).toHaveLength(1);
    },
  );

  it.each(['outline', 'completionPolicy'] as const)(
    'rejects a %s belonging to another course',
    async (part) => {
      response[part].courseId = randomUUID();
      await expect(
        client.structure(enrollment, requestContext),
      ).rejects.toMatchObject({ status: 503 });
      expect(received).toHaveLength(1);
    },
  );

  it.each([
    [404, 409],
    [409, 409],
    [401, 503],
    [403, 503],
    [503, 503],
  ])(
    'handles Course HTTP %i without switching to a different snapshot',
    async (upstreamStatus, expectedStatus) => {
      status = upstreamStatus;
      await expect(
        client.structure(enrollment, requestContext),
      ).rejects.toMatchObject({ status: expectedStatus });
      expect(received.map(({ path }) => path)).toEqual([expectedPath]);
    },
  );
});
