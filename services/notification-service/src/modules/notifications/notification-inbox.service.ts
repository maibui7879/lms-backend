import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { parseContract } from '@lms/contracts';

/** A single INSERT deduplicates broker redelivery before ACK. No Course DB access. */
@Injectable()
export class NotificationInboxService {
  constructor(private readonly database: DataSource) {}

  async accept(input: unknown): Promise<void> {
    if (
      input &&
      typeof input === 'object' &&
      (input as { eventType?: unknown }).eventType ===
        'course.enrollment.created'
    ) {
      const event = parseContract('EnrollmentCreatedV2Event', input);
      const payload = event.payload;
      await this.database.query(
        `INSERT INTO notification.notifications
        (id, "recipientId", "courseId", "revisionId", type, title, message, "eventKey", "createdAt", "readAt", "emittedAt")
        VALUES ($1,$2,$3,NULL,'ENROLLMENT_SUCCEEDED',$4,$5,$6,$7,NULL,NULL)
        ON CONFLICT ("eventKey") DO NOTHING`,
        [
          event.eventId,
          payload.userId,
          payload.courseId,
          'Ghi danh thành công',
          event.courseTitle
            ? `Bạn đã ghi danh thành công khóa học “${event.courseTitle}”.`
            : 'Bạn đã ghi danh thành công khóa học.',
          `enrollment:${payload.enrollmentId}:created`,
          event.occurredAt,
        ],
      );
      return;
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
    await this.database.query(
      `INSERT INTO notification.notifications
      (id, "recipientId", "courseId", "revisionId", type, title, message, "eventKey", "createdAt", "readAt", "emittedAt")
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NULL,NULL)
      ON CONFLICT ("eventKey") DO NOTHING`,
      [
        event.eventId,
        payload.recipientId,
        payload.courseId,
        payload.revisionId,
        type,
        title,
        message,
        event.eventId,
        event.occurredAt,
      ],
    );
  }
}
