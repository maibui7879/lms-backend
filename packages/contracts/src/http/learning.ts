import type { Uuid } from './common';
import type { ProgressSyncStatus } from './quiz';

export type LearningStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
export type ChapterAccessStatus = 'LOCKED' | 'UNLOCKED' | 'COMPLETED';
export type ChapterAccessReason =
  | 'ENROLLMENT_REQUIRED'
  | 'COURSE_NOT_PUBLISHED'
  | 'PREVIOUS_CHAPTER_NOT_COMPLETED'
  | 'PREREQUISITE_NOT_COMPLETED';

export interface ChapterAccessData {
  chapterId: Uuid;
  order: number;
  contentVersion: number;
  status: ChapterAccessStatus;
  reason: ChapterAccessReason | null;
}
export interface CourseChapterAccessData {
  courseId: Uuid;
  contentVersion: number;
  chapters: ChapterAccessData[];
}

export interface ItemProgressData {
  learningItemId: Uuid;
  contentVersion: number;
  status: LearningStatus;
  completedAt: string | null;
}
export interface LessonProgressData {
  userId: Uuid;
  courseId: Uuid;
  lessonId: Uuid;
  contentVersion: number;
  status: LearningStatus;
  completedAt: string | null;
  items: ItemProgressData[];
}
export interface CompleteLessonRequest {
  completed: true;
  contentVersion: number;
}
export interface CompleteItemRequest {
  completed: true;
  contentVersion: number;
}
export interface CourseProgressData {
  userId: Uuid;
  courseId: Uuid;
  enrollmentId: Uuid;
  contentVersion: number;
  status: LearningStatus;
  completedRequiredItems: number;
  totalRequiredItems: number;
  progressPercent: number;
  passedRequiredAssessments: number;
  totalRequiredAssessments: number;
  completedAt: string | null;
  updatedAt: string;
}
export interface SaveResumeRequest {
  lessonId: Uuid;
  learningItemId: Uuid;
  contentVersion: number;
  positionSeconds: number | null;
  /** 0 creates the first checkpoint. */
  expectedRevision: number;
}
export interface LearningResumeData {
  userId: Uuid;
  courseId: Uuid;
  lessonId: Uuid;
  learningItemId: Uuid;
  contentVersion: number;
  positionSeconds: number | null;
  updatedAt: string;
  revision: number;
}
export interface LearningDashboardData {
  courses: CourseProgressData[];
  updatedAt: string;
}
export interface MasteryData {
  courseId: Uuid;
  userId: Uuid;
  skills: {
    skillId: Uuid;
    scorePercent: number;
    level: 'BEGINNER' | 'DEVELOPING' | 'PROFICIENT';
    evidenceCount: number;
  }[];
  algorithmVersion: string;
  updatedAt: string;
}
export interface RecommendationData {
  courseId: Uuid;
  lessonId: Uuid;
  learningItemId: Uuid | null;
  reason: 'NEXT_REQUIRED_ITEM' | 'LOW_MASTERY' | 'RETRY_ASSESSMENT';
  explanation: string;
}
export interface CertificateData {
  id: Uuid;
  courseId: Uuid;
  userId: Uuid;
  enrollmentId: Uuid;
  contentVersion: number;
  issuedAt: string;
  verificationCode: string;
  downloadUrl: string;
}
/** Public verification intentionally excludes email, userId and enrollmentId. */
export interface CertificateVerificationData {
  valid: boolean;
  courseTitle: string | null;
  recipientName: string | null;
  issuedAt: string | null;
}
export interface LearningStatisticsData {
  courseId: Uuid;
  enrolledCount: number;
  completedCount: number;
  averageProgressPercent: number | null;
  updatedAt: string;
}
export interface ProgressSyncData {
  attemptId: Uuid;
  eventId: Uuid | null;
  status: ProgressSyncStatus;
  updatedAt: string | null;
  error: { code: 'PROJECTION_FAILED'; message: string } | null;
}
