import { NotificationInboxService } from './notification-inbox.service';
import { NotificationEventsConsumer } from './notification-events.consumer';
import type { ConsumeMessage, ConfirmChannel } from 'amqplib';
import type { NotificationInboxService as Inbox } from './notification-inbox.service';
import { ContractValidationError } from '@lms/contracts';

const id = '11111111-1111-4111-8111-111111111111';
const event = {
  eventId: id,
  eventType: 'course.review.decided',
  version: 1,
  occurredAt: '2026-11-24T00:00:00.000Z',
  producer: 'course-service',
  correlationId: id,
  payload: {
    recipientId: id,
    courseId: id,
    revisionId: null,
    decision: 'REJECT',
    reason: 'Needs content',
    version: 3,
  },
};

it('writes a deduplicated inbox entry without reading Course tables', async () => {
  const database = { query: jest.fn(async () => []) };
  const service = new NotificationInboxService(database as never);
  await service.accept(event);
  const [sql, params] = database.query.mock.calls[0] as unknown as [
    string,
    unknown[],
  ];
  expect(sql).toContain('INSERT INTO notification.notifications');
  expect(sql).toContain('ON CONFLICT ("eventKey") DO NOTHING');
  expect(params).toContain('COURSE_REJECTED');
  expect(params[0]).toBe(id);
  expect(params[7]).toBe(id);
  expect(params[6]).toContain('Needs content');
});

it('deduplicates enroll notifications by enrollmentId even if eventId changes', async () => {
  const persisted = new Map<string, unknown[]>();
  const database = {
    query: jest.fn(async (_sql: string, values: unknown[]) => {
      const key = values[5] as string;
      if (!persisted.has(key)) persisted.set(key, values);
      return [];
    }),
  };
  const service = new NotificationInboxService(database as never);
  const enrollment = {
    ...event,
    eventType: 'course.enrollment.created',
    version: 2,
    courseTitle: 'Lập trình',
    payload: {
      enrollmentId: id,
      userId: id,
      courseId: id,
      contentVersion: 1,
      status: 'ACTIVE',
      enrolledAt: event.occurredAt,
    },
  };
  await service.accept(enrollment);
  await service.accept({
    ...enrollment,
    eventId: '22222222-2222-4222-8222-222222222222',
  });
  expect(persisted.size).toBe(1);
  expect([...persisted.values()][0][4]).toContain('Lập trình');
  expect([...persisted.values()][0][1]).toBe(id);
  expect(database.query.mock.calls[0][0]).toContain(
    'ON CONFLICT ("eventKey") DO NOTHING',
  );
});

it('rejects invalid event identities before touching DB', async () => {
  const database = { query: jest.fn() };
  const service = new NotificationInboxService(database as never);
  await expect(
    service.accept({ ...event, producer: 'quiz-service' }),
  ).rejects.toBeInstanceOf(ContractValidationError);
  expect(database.query).not.toHaveBeenCalled();
});

describe('notification broker acknowledgment and retry', () => {
  function setup() {
    const inbox = { accept: jest.fn(async (_event: unknown) => undefined) };
    const consumer = new NotificationEventsConsumer(inbox as unknown as Inbox);
    const channel = {
      ack: jest.fn(),
      nack: jest.fn(),
      close: jest.fn(async () => undefined),
      sendToQueue: jest.fn(
        (
          _queue: string,
          _body: Buffer,
          _options: unknown,
          callback: (error?: Error) => void,
        ) => {
          callback();
          return true;
        },
      ),
    };
    const handle = (body: Buffer, retries = 0) =>
      (
        consumer as unknown as {
          handle(
            message: ConsumeMessage,
            channel: ConfirmChannel,
          ): Promise<void>;
        }
      ).handle(
        {
          content: body,
          properties: {
            headers: { 'x-notification-retry': retries },
            messageId: id,
          },
        } as unknown as ConsumeMessage,
        channel as unknown as ConfirmChannel,
      );
    return { inbox, consumer, channel, handle };
  }
  it('ACKs only after persistence', async () => {
    const { handle, inbox, channel } = setup();
    await handle(Buffer.from(JSON.stringify(event)));
    expect(inbox.accept).toHaveBeenCalledTimes(1);
    expect(channel.ack).toHaveBeenCalledTimes(1);
    expect(channel.nack).not.toHaveBeenCalled();
    expect(inbox.accept.mock.invocationCallOrder[0]).toBeLessThan(
      channel.ack.mock.invocationCallOrder[0],
    );
  });
  it('dead letters invalid JSON without a retry loop', async () => {
    const { handle, channel, inbox } = setup();
    await handle(Buffer.from('{broken'));
    expect(channel.nack).toHaveBeenCalledWith(expect.anything(), false, false);
    expect(channel.ack).not.toHaveBeenCalled();
    expect(inbox.accept).not.toHaveBeenCalled();
  });
  it('confirms delayed retry before acknowledging a transient DB failure', async () => {
    const { handle, channel, inbox } = setup();
    inbox.accept.mockRejectedValueOnce(new Error('DB unavailable'));
    await handle(Buffer.from(JSON.stringify(event)));
    expect(channel.sendToQueue).toHaveBeenCalledWith(
      'notification.course-review.v1.retry',
      expect.any(Buffer),
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-notification-retry': 1 }),
      }),
      expect.any(Function),
    );
    expect(channel.ack).toHaveBeenCalledTimes(1);
  });
  it('dead letters transient failure after five retries', async () => {
    const { handle, channel, inbox } = setup();
    inbox.accept.mockRejectedValueOnce(new Error('DB unavailable'));
    await handle(Buffer.from(JSON.stringify(event)), 5);
    expect(channel.nack).toHaveBeenCalledWith(expect.anything(), false, false);
    expect(channel.sendToQueue).not.toHaveBeenCalled();
  });
});
