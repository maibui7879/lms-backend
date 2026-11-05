import type { Uuid } from '../http/common';
import type { EnrollmentStatus } from '../http/enrollment';
import type { EventEnvelope } from './envelope';

export const ENROLLMENT_CREATED_EVENT = 'course.enrollment.created' as const;
export const ENROLLMENT_CREATED_ROUTING_KEY = 'course.enrollment.created.v1' as const;

export interface EnrollmentCreatedPayload {
  enrollmentId: Uuid;
  courseId: Uuid;
  userId: Uuid;
  status: EnrollmentStatus;
  enrolledAt: string;
}

export type EnrollmentCreatedEvent = EventEnvelope<
  typeof ENROLLMENT_CREATED_EVENT,
  EnrollmentCreatedPayload
>;
