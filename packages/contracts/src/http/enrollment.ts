import type { ApiResponse, Uuid } from './common';

export type EnrollmentStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

export interface CreateEnrollmentRequest {
  // userId is taken from the authenticated identity context, never from the client body.
  readonly userId?: never;
}

export interface EnrollmentData {
  enrollmentId: Uuid;
  courseId: Uuid;
  userId: Uuid;
  status: EnrollmentStatus;
  enrolledAt: string;
  /** Required for new producers; optional only for legacy v1 consumers. */
  contentVersion?: number;
}

export type CreateEnrollmentResponse = ApiResponse<EnrollmentData>;

/** New enrollment APIs pin the requirements snapshot; legacy data remains readable. */
export interface EnrollmentSnapshotData extends EnrollmentData {
  contentVersion: number;
}

export interface EnrollmentCheckQuery {
  userId: Uuid;
  courseId: Uuid;
}

export interface EnrollmentCheckData {
  enrolled: boolean;
  enrollmentId?: Uuid;
  status?: EnrollmentStatus;
}

export type EnrollmentCheckResponse = ApiResponse<EnrollmentCheckData>;
