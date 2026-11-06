import type { Uuid } from './common';
import type { PageQuery, VersionRequest } from '../common/pagination';

export type QuizType = 'PRACTICE' | 'GRADED';
export type QuizStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export interface QuizPolicy {
  quizType: QuizType;
  durationSeconds: number;
  passingScorePercent: number;
  maxAttempts: number;
  requiredForCompletion: boolean;
  shuffleQuestions: boolean;
  shuffleChoices: boolean;
  reviewPolicy: 'AFTER_SUBMISSION' | 'AFTER_CLOSE' | 'NEVER';
}
export interface CreateQuizRequest {
  courseId: Uuid;
  lessonId: Uuid;
  title: string;
  policy: QuizPolicy;
  opensAt: string | null;
  closesAt: string | null;
}
export interface UpdateQuizRequest extends VersionRequest {
  title?: string;
  policy?: QuizPolicy;
  opensAt?: string | null;
  closesAt?: string | null;
}
export interface QuizData extends CreateQuizRequest {
  id: Uuid;
  instructorId: Uuid;
  status: QuizStatus;
  assessmentVersion: number;
  version: number;
}
export interface ChoiceData {
  id: Uuid;
  text: string;
}
export interface QuestionDeliveryDTO {
  id: Uuid;
  type: 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE';
  prompt: string;
  choices: ChoiceData[];
  points: number;
}
export interface QuestionAuthoringDTO extends QuestionDeliveryDTO {
  skillIds: Uuid[];
  correctChoiceIds: Uuid[];
  explanation: string | null;
  version: number;
}
export interface CreateQuestionRequest {
  skillIds: Uuid[];
  type: QuestionDeliveryDTO['type'];
  prompt: string;
  choices: ChoiceData[];
  points: number;
  correctChoiceIds: Uuid[];
  explanation: string | null;
}
export type UpdateQuestionRequest = CreateQuestionRequest & VersionRequest;
export type AttemptStatus = 'IN_PROGRESS' | 'SUBMITTED' | 'EXPIRED';
export type GradingStatus = 'NOT_GRADED' | 'PENDING_REVIEW' | 'GRADED';
export type ProgressSyncStatus = 'PENDING' | 'SYNCED' | 'FAILED';
export interface QuizAnswer {
  questionId: Uuid;
  selectedChoiceIds: Uuid[];
}
export interface SaveAnswersRequest {
  /** Entire answer set replaces previous revision; empty selections clear answers. */
  answers: QuizAnswer[];
  expectedRevision: number;
}
export interface SubmitAttemptRequest {
  expectedRevision: number;
}
export interface QuizAttemptData {
  attemptId: Uuid;
  quizId: Uuid;
  courseId: Uuid;
  userId: Uuid;
  assessmentVersion: number;
  policySnapshot: QuizPolicy;
  attemptStatus: AttemptStatus;
  gradingStatus: GradingStatus;
  startedAt: string;
  expiresAt: string;
  submittedAt: string | null;
  revision: number;
  answers: QuizAnswer[];
}
export interface StartAttemptData extends QuizAttemptData {
  questions: QuestionDeliveryDTO[];
  serverTime: string;
}
export interface StartAttemptRequest {
  readonly userId?: never;
}
export interface AttemptQuery extends PageQuery {
  quizId?: Uuid;
}
export interface QuestionReviewData {
  questionId: Uuid;
  selectedChoiceIds: Uuid[];
  correctChoiceIds: Uuid[];
  pointsAwarded: number;
  maxPoints: number;
  explanation: string | null;
}
export interface QuizReviewData {
  attemptId: Uuid;
  assessmentVersion: number;
  questions: QuestionReviewData[];
}
export interface QuestionStatisticsData {
  questionId: Uuid;
  responses: number;
  correctResponses: number;
  difficultyPercent: number | null;
}
export interface QuizStatisticsData {
  quizId: Uuid;
  assessmentVersion: number;
  gradedAttempts: number;
  averageScorePercent: number | null;
  passRatePercent: number | null;
  questions: QuestionStatisticsData[];
}
