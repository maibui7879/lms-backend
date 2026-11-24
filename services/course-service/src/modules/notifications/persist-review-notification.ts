import { randomUUID } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import {
  COURSE_REVIEW_NOTIFICATION_ROUTING_KEY,
  type CourseReviewNotificationEvent,
} from '@lms/contracts';
import { EnrollmentOutboxEvent } from '../outbox/enrollment-outbox.entity';

/** Must be called inside the review transaction, never after commit. */
export async function persistReviewNotification(
  manager: EntityManager,
  input: {
    recipientId: string;
    courseId: string;
    revisionId: string | null;
    decision: 'APPROVE' | 'REJECT';
    reason?: string;
    version: number;
  },
): Promise<void> {
  const eventId = randomUUID();
  const createdAt = new Date();
  const event: CourseReviewNotificationEvent = {
    eventId,
    eventType: 'course.review.decided',
    version: 1,
    occurredAt: createdAt.toISOString(),
    producer: 'course-service',
    correlationId: randomUUID(),
    payload: { ...input, reason: input.reason ?? null },
  };
  await manager.save(EnrollmentOutboxEvent, {
    id: eventId,
    routingKey: COURSE_REVIEW_NOTIFICATION_ROUTING_KEY,
    event,
    createdAt,
    sentAt: null,
  });
}
