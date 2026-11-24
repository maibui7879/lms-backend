import type { Uuid } from '../http/common';

export interface CourseReviewNotificationEvent {
  eventId: Uuid;
  eventType: 'course.review.decided';
  version: 1;
  occurredAt: string;
  producer: 'course-service';
  correlationId: Uuid;
  payload: {
    recipientId: Uuid;
    courseId: Uuid;
    revisionId: Uuid | null;
    decision: 'APPROVE' | 'REJECT';
    reason: string | null;
    version: number;
  };
}

export const COURSE_REVIEW_NOTIFICATION_ROUTING_KEY =
  'course.review.decided.v1';
