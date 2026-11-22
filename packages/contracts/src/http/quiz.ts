import type { Uuid } from './common';
import type { PageQuery, VersionRequest } from '../common/pagination';

export type QuizType = 'PRACTICE' | 'GRADED';
/** Chỉ DRAFT được sửa; PUBLISHED và ARCHIVED không được sửa nội dung hoặc policy. */
export type QuizStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export interface QuizPolicy {
  quizType: QuizType;
  durationSeconds: number;
  passingScorePercent: number;
  maxAttempts: number;
  requiredForCompletion: boolean;
  shuffleQuestions: boolean;
  shuffleChoices: boolean;
  reviewPolicy: 'AFTER_SUBMISSION' | 'NEVER';
}
export type QuizPlacement =
  | { placement: 'LESSON'; lessonId: Uuid }
  | { placement: 'SECTION_END'; lessonId: null };
export interface CreateQuizRequestBase {
  courseId: Uuid;
  chapterId: Uuid;
  title: string;
  policy: QuizPolicy;
}
export type CreateQuizRequest = CreateQuizRequestBase & QuizPlacement;
/** Chỉ áp dụng khi trạng thái quiz trong DB là DRAFT; version khớp không thay thế kiểm tra trạng thái. */
export type UpdateQuizRequest = Partial<
  Pick<CreateQuizRequestBase, 'title' | 'policy'>
> &
  VersionRequest;
export type QuizData = CreateQuizRequest & {
  id: Uuid;
  instructorId: Uuid;
  status: QuizStatus;
  assessmentVersion: number;
  version: number;
};
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
  //câu hỏi giảng viên soạn
  /** PRACTICE may use []; existing skill mappings remain readable and do not contribute to mastery. */
  skillIds: Uuid[]; //gắn bộ kỹ năng
  correctChoiceIds: Uuid[]; //ds đáp án đúng
  explanation: string | null;
  version: number;
}
/** Chỉ thêm câu hỏi khi quiz cha còn DRAFT. */
export interface CreateQuestionRequest {
  /** PRACTICE does not require skills: send []; Quiz resolves the type from the parent quiz. */
  skillIds: Uuid[];
  type: QuestionDeliveryDTO['type'];
  prompt: string;
  choices: ChoiceData[];
  points: number;
  correctChoiceIds: Uuid[];
  explanation: string | null;
}
/** Chỉ sửa câu hỏi khi quiz cha còn DRAFT, kể cả khi expectedVersion khớp. */
export type UpdateQuestionRequest = CreateQuestionRequest & VersionRequest;
export type AttemptStatus = 'IN_PROGRESS' | 'SUBMITTED' | 'EXPIRED';
/** MVP quizzes are graded automatically; there is no manual-review state. */
export type GradingStatus = 'NOT_GRADED' | 'GRADED';
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
