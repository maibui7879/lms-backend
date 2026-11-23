import { Logger } from '@nestjs/common';
import type { CourseNotificationData } from '@lms/contracts';
import type { Repository } from 'typeorm';
import type { Notification } from '../entities/notification.entity';
import type { NotificationsGateway } from '../gateways/notifications.gateway';
import { NotificationDispatcherService } from './notification-dispatcher.service';

describe('Notification dispatcher', () => {
  const row = {
    id: 'notification',
    recipientId: 'recipient',
    courseId: 'course',
    revisionId: null,
    type: 'COURSE_APPROVED',
    title: 'Approved',
    message: 'Published',
    createdAt: new Date('2026-11-24T00:00:00Z'),
    readAt: null,
  } as Notification;

  function setup() {
    const repository = {
      find: jest.fn(async () => [row]),
      update: jest.fn(async () => undefined),
    };
    const gateway = {
      publish: jest.fn(
        async (_data: CourseNotificationData, _recipientId: string) =>
          undefined,
      ),
    };
    const dispatcher = new NotificationDispatcherService(
      repository as unknown as Repository<Notification>,
      gateway as unknown as NotificationsGateway,
    );
    return { dispatcher, repository, gateway };
  }

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('publishes before marking a row emitted, without exposing persistence fields', async () => {
    const { dispatcher, repository, gateway } = setup();
    await dispatcher.dispatch();
    expect(gateway.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        id: row.id,
        createdAt: row.createdAt.toISOString(),
      }),
      row.recipientId,
    );
    expect(gateway.publish.mock.calls[0][0]).not.toHaveProperty('recipientId');
    expect(repository.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: row.id }),
      { emittedAt: expect.any(Date) },
    );
    expect(gateway.publish.mock.invocationCallOrder[0]).toBeLessThan(
      repository.update.mock.invocationCallOrder[0],
    );
  });

  it('does not mark failed delivery emitted and permits the next retry', async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { dispatcher, repository, gateway } = setup();
    gateway.publish.mockRejectedValueOnce(new Error('Unavailable'));
    await dispatcher.dispatch();
    expect(repository.update).not.toHaveBeenCalled();
    await dispatcher.dispatch();
    expect(repository.update).toHaveBeenCalledTimes(1);
  });

  it('skips overlapping dispatch runs', async () => {
    const { dispatcher, repository } = setup();
    let release!: (rows: Notification[]) => void;
    repository.find.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const first = dispatcher.dispatch();
    await dispatcher.dispatch();
    expect(repository.find).toHaveBeenCalledTimes(1);
    release([]);
    await first;
  });

  it('cleans up the polling timer on shutdown', () => {
    jest.useFakeTimers();
    const { dispatcher } = setup();
    dispatcher.onApplicationBootstrap();
    expect(jest.getTimerCount()).toBe(1);
    dispatcher.onModuleDestroy();
    expect(jest.getTimerCount()).toBe(0);
  });
});
