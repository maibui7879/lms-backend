import type { ApiResponse, Uuid } from './common';

export type QuizAttemptStatus = 'IN_PROGRESS' | 'SUBMITTED' | 'PENDING_REVIEW';

export interface QuizResultData {
  attemptId: Uuid;
  quizId: Uuid;
  courseId: Uuid;
  userId: Uuid;
  score: number;
  maxScore: number;
  passed: boolean;
  status: QuizAttemptStatus;
  gradedAt?: string;
}

export type QuizResultResponse = ApiResponse<QuizResultData>;
