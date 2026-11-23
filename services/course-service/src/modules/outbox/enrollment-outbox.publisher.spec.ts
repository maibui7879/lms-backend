import { EnrollmentOutboxPublisher } from './enrollment-outbox.publisher';
import { EnrollmentOutboxEvent } from './enrollment-outbox.entity';
import { DataSource } from 'typeorm';
import { connect } from 'amqplib';
import { COURSE_REVIEW_NOTIFICATION_ROUTING_KEY } from '@lms/contracts';

jest.mock('amqplib', () => ({ connect: jest.fn() }));

describe('Enrollment outbox delivery', () => {
  const row = {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    routingKey: 'course.enrollment.created.v2',
    event: {
      eventId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      correlationId: 'request-1',
    },
  };
  const query = {
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    setLock: jest.fn().mockReturnThis(),
    setOnLocked: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
  };
  const update = jest.fn();
  const manager = {
    getRepository: () => ({ createQueryBuilder: () => query }),
    update,
  };
  const database = {
    transaction: jest.fn(async (callback) => callback(manager)),
  } as unknown as DataSource;
  const channel = {
    on: jest.fn(),
    assertExchange: jest.fn(),
    assertQueue: jest.fn(),
    bindQueue: jest.fn(),
    publish: jest.fn(),
  };
  const connection = {
    on: jest.fn(),
    createConfirmChannel: jest.fn(),
    close: jest.fn(),
  };
  const originalUrl = process.env.RABBITMQ_URL;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.RABBITMQ_URL = 'amqp://broker';
    query.getMany.mockResolvedValue([row]);
    jest.mocked(connect).mockResolvedValue(connection as never);
    connection.createConfirmChannel.mockResolvedValue(channel);
    channel.publish.mockImplementation(
      (_exchange, _key, _body, _options, callback) => callback(null),
    );
  });

  afterAll(() => {
    if (originalUrl === undefined) delete process.env.RABBITMQ_URL;
    else process.env.RABBITMQ_URL = originalUrl;
  });

  it('marks sent only after broker confirms persistent delivery', async () => {
    await new EnrollmentOutboxPublisher(database).flush();
    expect(query.setLock).toHaveBeenCalledWith('pessimistic_write');
    expect(query.setOnLocked).toHaveBeenCalledWith('skip_locked');
    expect(channel.publish).toHaveBeenCalledWith(
      'lms.events',
      row.routingKey,
      Buffer.from(JSON.stringify(row.event)),
      expect.objectContaining({ persistent: true, messageId: row.id }),
      expect.any(Function),
    );
    expect(update).toHaveBeenCalledWith(
      EnrollmentOutboxEvent,
      { id: row.id },
      { sentAt: expect.any(Date) },
    );
    expect(connection.close).toHaveBeenCalled();
  });

  it('leaves failed events pending and retries the same identity', async () => {
    channel.publish.mockImplementationOnce(
      (_exchange, _key, _body, _options, callback) =>
        callback(new Error('nack')),
    );
    const publisher = new EnrollmentOutboxPublisher(database);
    await expect(publisher.flush()).rejects.toThrow('nack');
    expect(update).not.toHaveBeenCalled();
    await publisher.flush();
    expect(channel.publish.mock.calls[0][2]).toEqual(
      channel.publish.mock.calls[1][2],
    );
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('establishes durable notification routing before publishing without a consumer', async () => {
    query.getMany.mockResolvedValue([
      { ...row, routingKey: COURSE_REVIEW_NOTIFICATION_ROUTING_KEY },
    ]);
    await new EnrollmentOutboxPublisher(database).flush();
    expect(channel.assertQueue).toHaveBeenNthCalledWith(
      1,
      'notification.course-review.v1.dead',
      { durable: true },
    );
    expect(channel.assertQueue).toHaveBeenNthCalledWith(
      2,
      'notification.course-review.v1',
      {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': '',
          'x-dead-letter-routing-key': 'notification.course-review.v1.dead',
        },
      },
    );
    expect(channel.bindQueue).toHaveBeenCalledWith(
      'notification.course-review.v1',
      'lms.events',
      COURSE_REVIEW_NOTIFICATION_ROUTING_KEY,
    );
    expect(channel.assertQueue.mock.invocationCallOrder[1]).toBeLessThan(
      channel.bindQueue.mock.invocationCallOrder[0],
    );
    expect(channel.bindQueue.mock.invocationCallOrder[0]).toBeLessThan(
      channel.publish.mock.invocationCallOrder[0],
    );
  });

  it('leaves notification events pending when binding fails', async () => {
    query.getMany.mockResolvedValue([
      { ...row, routingKey: COURSE_REVIEW_NOTIFICATION_ROUTING_KEY },
    ]);
    channel.bindQueue.mockRejectedValueOnce(new Error('binding failed'));
    await expect(
      new EnrollmentOutboxPublisher(database).flush(),
    ).rejects.toThrow('binding failed');
    expect(channel.publish).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(connection.close).toHaveBeenCalled();
  });

  it('does not declare notification queues for cancellation-only batches', async () => {
    query.getMany.mockResolvedValue([
      { ...row, routingKey: 'course.enrollment.cancelled.v1' },
    ]);
    await new EnrollmentOutboxPublisher(database).flush();
    expect(channel.assertQueue).not.toHaveBeenCalled();
    expect(channel.bindQueue).not.toHaveBeenCalled();
  });

  it('does not mark sent when broker connection fails', async () => {
    jest.mocked(connect).mockRejectedValueOnce(new Error('offline'));
    await expect(
      new EnrollmentOutboxPublisher(database).flush(),
    ).rejects.toThrow('offline');
    expect(update).not.toHaveBeenCalled();
  });

  it('avoids broker connections when the outbox is empty', async () => {
    query.getMany.mockResolvedValue([]);
    await new EnrollmentOutboxPublisher(database).flush();
    expect(connect).not.toHaveBeenCalled();
  });
});
