import type { EntityManager } from 'typeorm';
import {
  COURSE_REVIEW_NOTIFICATION_ROUTING_KEY,
  parseContract,
} from '@lms/contracts';
import { EnrollmentOutboxEvent } from '../outbox/enrollment-outbox.entity';
import { persistReviewNotification } from './persist-review-notification';

describe('persistReviewNotification', () => {
  it.each(['APPROVE', 'REJECT'] as const)(
    'persists a valid %s event using the supplied transaction manager',
    async (decision) => {
      const save = jest.fn().mockResolvedValue(undefined);
      const manager = { save } as unknown as EntityManager;
      const input = {
        recipientId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        courseId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        revisionId: null,
        decision,
        version: 3,
        ...(decision === 'REJECT' ? { reason: 'Needs changes' } : {}),
      };

      await persistReviewNotification(manager, input);

      expect(save).toHaveBeenCalledTimes(1);
      const [entity, row] = save.mock.calls[0];
      expect(entity).toBe(EnrollmentOutboxEvent);
      parseContract('CourseReviewNotificationEvent', row.event);
      expect(row).toEqual({
        id: row.event.eventId,
        routingKey: COURSE_REVIEW_NOTIFICATION_ROUTING_KEY,
        event: {
          eventId: row.id,
          eventType: 'course.review.decided',
          version: 1,
          producer: 'course-service',
          occurredAt: row.createdAt.toISOString(),
          correlationId: expect.any(String),
          payload: { ...input, reason: input.reason ?? null },
        },
        createdAt: expect.any(Date),
        sentAt: null,
      });
    },
  );
});
