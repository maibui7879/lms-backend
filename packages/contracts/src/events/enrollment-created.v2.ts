import type { EnrollmentSnapshotData } from '../http/enrollment';
import type { EventEnvelope } from './envelope';

/** Enrollment pins a published requirements snapshot before Learning initializes. */
export const ENROLLMENT_CREATED_V2_ROUTING_KEY =
  'course.enrollment.created.v2' as const;
export interface EnrollmentCreatedV2Event extends EventEnvelope<
  'course.enrollment.created',
  EnrollmentSnapshotData,
  2
> {
  producer: 'course-service';
}
