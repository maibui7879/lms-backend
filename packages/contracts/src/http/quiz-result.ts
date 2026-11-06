import type { ApiResponse, Uuid } from './common';
import type { AttemptStatus, GradingStatus } from './quiz';

/** @deprecated Use AttemptStatus and GradingStatus separately. */
export type QuizAttemptStatus = 'IN_PROGRESS' | 'SUBMITTED' | 'PENDING_REVIEW';

export interface QuizResultData {
  attemptId: Uuid;
  quizId: Uuid;
  courseId: Uuid;
  userId: Uuid;
  score: number;
  maxScore: number;
  passed: boolean;
  /** @deprecated Compatibility field; use QuizResultV2Data for new endpoints. */
  status: QuizAttemptStatus;
  gradedAt?: string;
}

export type QuizResultResponse = ApiResponse<QuizResultData>;

/** Scores are absent until grading completes; never fabricate a zero result. */
export type QuizResultV2Data = {
  attemptId: Uuid;
  quizId: Uuid;
  courseId: Uuid;
  userId: Uuid;
  assessmentVersion: number;
  attemptStatus: AttemptStatus;
} & (
  | {
      gradingStatus: 'GRADED';
      score: number;
      maxScore: number;
      passed: boolean;
      gradedAt: string;
    }
  | {
      gradingStatus: Exclude<GradingStatus, 'GRADED'>;
      score: null;
      maxScore: null;
      passed: null;
      gradedAt: null;
    }
);
export type QuizResultV2Response = ApiResponse<QuizResultV2Data>;
