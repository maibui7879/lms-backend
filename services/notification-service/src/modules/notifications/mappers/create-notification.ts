import { parseContract } from '@lms/contracts';
import type { CourseNotificationData } from '@lms/contracts';

export interface NotificationEntry {
  id: string;
  recipientId: string;
  courseId: string;
  revisionId: string | null;
  type: CourseNotificationData['type'];
  title: string;
  message: string;
  eventKey: string;
  createdAt: string;
}

/** Validate broker events and create durable inbox values without accessing storage. */
export function createNotification(input: unknown): NotificationEntry {
  if (
    input &&
    typeof input === 'object' &&
    (input as { eventType?: unknown }).eventType === 'course.enrollment.created'
  ) {
    const event = parseContract('EnrollmentCreatedV2Event', input);
    const payload = event.payload;
    return {
      id: event.eventId,
      recipientId: payload.userId,
      courseId: payload.courseId,
      revisionId: null,
      type: 'ENROLLMENT_SUCCEEDED',
      title: 'Ghi danh thành công',
      message: event.courseTitle
        ? `Bạn đã ghi danh thành công khóa học “${event.courseTitle}”.`
        : 'Bạn đã ghi danh thành công khóa học.',
      eventKey: `enrollment:${payload.enrollmentId}:created`,
      createdAt: event.occurredAt,
    };
  }
  const event = parseContract('CourseReviewNotificationEvent', input);
  const payload = event.payload;
  const approved = payload.decision === 'APPROVE';
  const revision = payload.revisionId !== null;
  const type = revision
    ? approved
      ? 'REVISION_APPROVED'
      : 'REVISION_REJECTED'
    : approved
      ? 'COURSE_APPROVED'
      : 'COURSE_REJECTED';
  const title = `${revision ? 'Bản cập nhật khóa học' : 'Khóa học'} ${approved ? 'đã được duyệt' : 'bị từ chối'}`;
  const message = approved
    ? 'Nội dung đã được phê duyệt và xuất bản.'
    : `Nội dung chưa được phê duyệt.${payload.reason ? ` Lý do: ${payload.reason}` : ''}`;
  return {
    id: event.eventId,
    recipientId: payload.recipientId,
    courseId: payload.courseId,
    revisionId: payload.revisionId,
    type,
    title,
    message,
    eventKey: event.eventId,
    createdAt: event.occurredAt,
  };
}
