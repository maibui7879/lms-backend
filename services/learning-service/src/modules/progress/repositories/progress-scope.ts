import type { EnrollmentSnapshotData } from '@lms/contracts';

export type ProgressEnrollment = Pick<
  EnrollmentSnapshotData,
  'enrollmentId' | 'contentVersion' | 'enrolledAt'
>;

export const legacyEnrollmentStart = '0001-01-01T00:00:00Z';

export function progressScope({
  enrollmentId,
  contentVersion,
  enrolledAt,
}: ProgressEnrollment) {
  return { enrollmentId, contentVersion, enrolledAt: new Date(enrolledAt) };
}

export function legacyProgressScope(
  scope: Omit<ReturnType<typeof progressScope>, 'enrolledAt'>,
) {
  return { ...scope, enrolledAt: new Date(legacyEnrollmentStart) };
}
