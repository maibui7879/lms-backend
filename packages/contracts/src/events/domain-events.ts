import type { Uuid } from '../http/common';
import type { EventEnvelope } from './envelope';
import type { CourseReviewData } from '../http/course';

export interface EnrollmentCancelledPayload {
  enrollmentId: Uuid;
  courseId: Uuid;
  userId: Uuid;
  cancelledAt: string;
}
export interface CourseContentUpdatedPayload {
  courseId: Uuid;
  previousContentVersion: number;
  contentVersion: number;
}
export interface LessonCompletedPayload {
  userId: Uuid;
  courseId: Uuid;
  lessonId: Uuid;
  contentVersion: number;
  completedAt: string;
}
export interface CourseCompletedPayload {
  userId: Uuid;
  courseId: Uuid;
  enrollmentId: Uuid;
  contentVersion: number;
  completedAt: string;
}
export interface CoursePublishedPayload {
  courseId: Uuid;
  instructorId: Uuid;
  contentVersion: number;
  publishedAt: string;
}
export interface CertificateIssuedPayload {
  certificateId: Uuid;
  userId: Uuid;
  courseId: Uuid;
  issuedAt: string;
}
export type EnrollmentCancelledEvent = EventEnvelope<
  'course.enrollment.cancelled',
  EnrollmentCancelledPayload
>;
export type CourseContentUpdatedEvent = EventEnvelope<
  'course.content.updated',
  CourseContentUpdatedPayload
>;
export type LessonCompletedEvent = EventEnvelope<
  'learning.lesson.completed',
  LessonCompletedPayload
>;
export type CourseCompletedEvent = EventEnvelope<
  'learning.course.completed',
  CourseCompletedPayload
>;
export type CoursePublishedEvent = EventEnvelope<
  'course.published',
  CoursePublishedPayload
>;
export type CourseReviewedEvent = EventEnvelope<
  'course.reviewed',
  CourseReviewData
>;
export type CertificateIssuedEvent = EventEnvelope<
  'learning.certificate.issued',
  CertificateIssuedPayload
>;
export const DOMAIN_EVENT_ROUTING_KEYS = {
  enrollmentCancelled: 'course.enrollment.cancelled.v1',
  contentUpdated: 'course.content.updated.v1',
  lessonCompleted: 'learning.lesson.completed.v1',
  courseCompleted: 'learning.course.completed.v1',
  coursePublished: 'course.published.v1',
  courseReviewed: 'course.reviewed.v1',
  certificateIssued: 'learning.certificate.issued.v1',
} as const;
