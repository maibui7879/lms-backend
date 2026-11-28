import type { CourseNotificationData } from '@lms/contracts';
import type { Notification } from '../entities/notification.entity';

export function notificationData(row: Notification): CourseNotificationData {
  return {
    id: row.id,
    courseId: row.courseId,
    revisionId: row.revisionId,
    type: row.type,
    title: row.title,
    message: row.message,
    createdAt: row.createdAt.toISOString(),
    readAt: row.readAt?.toISOString() ?? null,
  };
}
