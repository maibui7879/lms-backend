import type { Uuid } from './common';
import type { ProgressSyncStatus } from './quiz';

export type LearningStatus =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'OUTDATED'
  | 'RESET';
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
  completedLessons: number;
  totalLessons: number;
  progressPercent: number;
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
  invalidatedAt: string | null;
  invalidationReason: string | null;
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
  /** Percentage of required items. */
  progressPercent: number;
  completedRequiredLessons: number;
  totalRequiredLessons: number;
  /** Percentage of required lessons with a recorded lesson completion. */
  lessonProgressPercent: number;
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
export type LearningNextStep =
  | {
      kind: 'LEARNING_ITEM';
      lessonId: Uuid;
      learningItemId: Uuid;
      positionSeconds: number | null;
    }
  | { kind: 'COMPLETE_LESSON'; lessonId: Uuid }
  | { kind: 'QUIZ'; quizId: Uuid; assessmentVersion: number };

export interface LearningDashboardCourse extends CourseProgressData {
  title: string;
  lastActivityAt: string;
  nextStep: LearningNextStep | null;
}

export interface LearningRecentQuiz {
  attemptId: Uuid;
  courseId: Uuid;
  quizId: Uuid;
  assessmentVersion: number;
  scorePercent: number;
  passed: boolean;
  gradedAt: string;
}

export interface LearningDashboardData {
  courses: LearningDashboardCourse[];
  recentQuizzes: LearningRecentQuiz[];
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
