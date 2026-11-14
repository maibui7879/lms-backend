import type { Uuid } from '../http/common';
import type { AccountStatus, UserRole } from '../http/auth';
import type {
  CourseCompletionPolicy, CourseOutlineData, CourseRevisionData,
  LearningItemData, RequiredAssessment,
} from '../http/course';
import type { CourseProgressData } from '../http/learning';
import type { AttemptStatus, GradingStatus, QuizType } from '../http/quiz';

export interface ContentVersionQuery {
  contentVersion: number;
}

export interface UserAccessStatus {
  userId: Uuid;
  status: AccountStatus;
  role: UserRole;
}
export interface CourseContentReference {
  courseId: Uuid;
  lessonId: Uuid;
  learningItemId: Uuid;
  quizId: Uuid;
  instructorId: Uuid;
  contentVersion: number;
  assessmentVersion: number;
  published: boolean;
  requiredForCompletion: boolean;
}
export interface CourseLearningStructure {
  outline: CourseOutlineData;
  completionPolicy: CourseCompletionPolicy;
}
/** Course supplies immutable, published revision metadata and item lineage. */
export interface CourseItemMigrationContext {
  revision: CourseRevisionData;
  items: {
    item: LearningItemData;
    previousItems: LearningItemData[];
    requiredAssessment: RequiredAssessment | null;
  }[];
}
export interface CourseAccessQuery {
  userId: Uuid;
  courseId: Uuid;
  learningItemId?: Uuid;
}
export type CourseAccessData =
  | { allowed: true; enrollmentId: Uuid; contentVersion: number }
  | {
      allowed: false;
      reason:
        | 'ENROLLMENT_REQUIRED'
        | 'COURSE_NOT_PUBLISHED'
        | 'PREREQUISITE_NOT_COMPLETED';
    };
export interface GradedAssessmentSummary {
  attemptId: Uuid;
  quizId: Uuid;
  courseId: Uuid;
  userId: Uuid;
  assessmentVersion: number;
  quizType: QuizType;
  passingScorePercent: number;
  score: number;
  maxScore: number;
  passed: boolean;
  gradedAt: string;
  /** Aggregated question scores per author-assigned skill; no answer keys. */
  skillScores: { skillId: Uuid; score: number; maxScore: number }[];
}
export interface AttemptAccessData {
  attemptId: Uuid;
  userId: Uuid;
  courseId: Uuid;
  eventId: Uuid | null;
  attemptStatus: AttemptStatus;
  gradingStatus: GradingStatus;
}
export type CourseProgressSummary = Omit<
  CourseProgressData,
  'userId' | 'enrollmentId'
>;
export interface LearnerProgressSummary {
  userId: Uuid;
  progress: CourseProgressSummary;
}
export interface LearnerAssessmentSummary {
  userId: Uuid;
  courseId: Uuid;
  quizId: Uuid;
  gradedAttempts: number;
  bestScorePercent: number | null;
  passed: boolean;
  assessmentVersion: number;
}
