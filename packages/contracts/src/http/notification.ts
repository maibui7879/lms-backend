import type { PageQuery } from '../common/pagination';
import type { ApiResponse, Uuid } from './common';

export interface CourseNotificationData {
  id: Uuid;
  courseId: Uuid;
  revisionId: Uuid | null;
  type:
    | 'ENROLLMENT_SUCCEEDED'
    | 'COURSE_APPROVED'
    | 'COURSE_REJECTED'
    | 'REVISION_APPROVED'
    | 'REVISION_REJECTED';
  title: string;
  message: string;
  createdAt: string;
  readAt: string | null;
}

export interface NotificationQuery extends PageQuery {
  unreadOnly?: boolean;
}

export interface UnreadNotificationCount {
  count: number;
}

/** Payload of notification.created in the Socket.IO /notifications namespace. */
export type NotificationCreatedPayload = ApiResponse<CourseNotificationData>;
