import { CourseMigrationDispatcher } from './course-migration-dispatch';

describe('Durable Learning migration delivery', () => {
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;
  const revisionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const row = {
    revisionId,
    courseId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    request: {
      revisionId,
      itemIds: ['cccccccc-cccc-4ccc-8ccc-cccccccccccc'],
      policy: 'REQUIRE_RECOMPLETION',
      reason: 'Correction',
    },
  };
  const query = {
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    setLock: jest.fn().mockReturnThis(),
    setOnLocked: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([row]),
  };
  const manager = {
    getRepository: () => ({ createQueryBuilder: () => query }),
    update: jest.fn(),
  };
  const database = {
    transaction: jest.fn(async (callback: (value: unknown) => unknown) =>
      callback(manager),
    ),
  };
  const publisher = new CourseMigrationDispatcher(database as never);
  const fetchMock = jest.fn();
  beforeEach(() => {
    manager.update.mockReset();
    fetchMock.mockReset();
    process.env.LEARNING_URL = 'http://learning.test';
    process.env.LEARNING_SERVICE_TOKEN = 'test-token';
    global.fetch = fetchMock;
  });
  afterAll(() => {
    global.fetch = originalFetch;
    process.env = originalEnv;
  });

  it('does not mark a failed migration delivered and retries the same payload', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true });
    await expect(publisher.flush()).rejects.toThrow();
    expect(manager.update).not.toHaveBeenCalled();
    await publisher.flush();
    expect(manager.update).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].body).toBe(
      fetchMock.mock.calls[1][1].body,
    );
    expect(fetchMock.mock.calls[0][1].headers['X-Request-Id']).toBe(revisionId);
  });
});
