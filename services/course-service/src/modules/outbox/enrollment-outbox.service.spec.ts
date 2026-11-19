import { EnrollmentOutboxService } from './enrollment-outbox.service';
import { EnrollmentOutboxEvent } from './enrollment-outbox.entity';
import type { EntityManager } from 'typeorm';
import { parseContract } from '@lms/contracts';

describe('Enrollment transactional outbox', () => {
  const service = new EnrollmentOutboxService();
  const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const payload = {
    enrollmentId: id,
    courseId: id,
    userId: id,
    status: 'ACTIVE' as const,
    enrolledAt: '2026-01-01T00:00:00.000Z',
    contentVersion: 7,
  };
  const insert = jest.fn().mockResolvedValue({});
  const manager = {
    queryRunner: { isTransactionActive: true },
    insert,
  } as unknown as EntityManager;

  beforeEach(() => jest.clearAllMocks());

  it('inserts a schema-valid v2 event through the supplied transaction manager', async () => {
    await service.created(manager, payload, 'request-1');
    const [entity, row] = insert.mock.calls[0];
    expect(entity).toBe(EnrollmentOutboxEvent);
    expect(row).toMatchObject({
      routingKey: 'course.enrollment.created.v2',
      sentAt: null,
      event: {
        payload,
        producer: 'course-service',
        correlationId: 'request-1',
        version: 2,
      },
    });
    expect(row.id).toBe(row.event.eventId);
    parseContract('EnrollmentCreatedV2Event', row.event);
  });

  it('records the original enrollment identity and cancellation time', async () => {
    const cancelled = {
      enrollmentId: id,
      courseId: id,
      userId: id,
      cancelledAt: payload.enrolledAt,
    };
    await service.cancelled(manager, cancelled, 'request-2');
    const row = insert.mock.calls[0][1];
    expect(row.routingKey).toBe('course.enrollment.cancelled.v1');
    parseContract('EnrollmentCancelledEvent', row.event);
    expect(row.event.payload).toEqual(cancelled);
  });

  it('refuses a write outside a transaction', () => {
    expect(() =>
      service.created(
        { insert } as unknown as EntityManager,
        payload,
        'request-1',
      ),
    ).toThrow('active transaction');
    expect(insert).not.toHaveBeenCalled();
  });

  it('propagates an outbox failure so the caller can roll back enrollment', async () => {
    insert.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(
      service.created(manager, payload, 'request-1'),
    ).rejects.toThrow('database unavailable');
  });
});
