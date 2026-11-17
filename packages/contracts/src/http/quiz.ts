import type { Uuid } from './common';
import type { PageQuery, VersionRequest } from '../common/pagination';

export type QuizType = 'PRACTICE' | 'GRADED';
export type QuizStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export interface QuizPolicy {
  quizType: QuizType; //loại
  durationSeconds: number; //thời gian làm bài
  passingScorePercent: number; //điểm đạt
  maxAttempts: number; //số lần đc phép làm
  requiredForCompletion: boolean; //có bắt buộc làm để hoàn thành khóa ko?
  shuffleQuestions: boolean; //có trộn câu hỏi ko 
  shuffleChoices: boolean; //có trộn đáp án không
  reviewPolicy: 'AFTER_SUBMISSION' | 'NEVER'; //quyền xem lại sau khi nộp 
}
//nơi gắn bài quiz 
export type QuizPlacement =   
  | { placement: 'LESSON'; lessonId: Uuid }
  | { placement: 'SECTION_END'; lessonId: null };
//base tạo bài quiz , tí nữa cho giao với placement 
  export interface CreateQuizRequestBase {
  courseId: Uuid;
  chapterId: Uuid;
  title: string;
  policy: QuizPolicy;
}
export type CreateQuizRequest = CreateQuizRequestBase & QuizPlacement;
export interface UpdateQuizRequest extends VersionRequest {
  title?: string;
  policy?: QuizPolicy;
}
export type QuizData = CreateQuizRequest & {
  id: Uuid;
  instructorId: Uuid;
  status: QuizStatus;
  assessmentVersion: number; //số lần sửa đổi bài quiz, mỗi lần sửa đổi sẽ tăng lên 1
  version: number; 
};
export interface ChoiceData {
  id: Uuid;
  text: string; //nhập chuỗi , xử lý thành nhiều đáp án sau 
}
export interface QuestionDeliveryDTO { //câu hỏi giao cho học viên
  id: Uuid;
  type: 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE';
  prompt: string;
  choices: ChoiceData[];
  points: number;
}
export interface QuestionAuthoringDTO extends QuestionDeliveryDTO {  //câu hỏi giảng viên soạn
  skillIds: Uuid[]; //gắn bộ kỹ năng
  correctChoiceIds: Uuid[]; //ds đáp án đúng
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
export type GradingStatus = 'NOT_GRADED' | 'PENDING_REVIEW' | 'GRADED'; //pending review chắc cho câu tự luận chấm tay
//để xử lý đồng bộ trạng thái làm bài của học viên với server, tránh trường hợp học viên làm bài offline rồi submit lên server
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
//xem lại lượt làm bài 
export interface QuizAttemptData {
  attemptId: Uuid;
  quizId: Uuid;
  courseId: Uuid;
  userId: Uuid;
  assessmentVersion: number;
  policySnapshot: QuizPolicy; // bắt đầu thi hệ thống chụp lại policy của thời điểm đó
  attemptStatus: AttemptStatus;
  gradingStatus: GradingStatus;
  startedAt: string;
  expiresAt: string;
  submittedAt: string | null;
  revision: number;
  answers: QuizAnswer[];
}
//lấy dữ liệu bắt đầu làm bài ? Lúc f5 đang làm dở thì lưu thêm cả câu hỏi và thời gian 
export interface StartAttemptData extends QuizAttemptData {
  questions: QuestionDeliveryDTO[];
  serverTime: string;
}
export interface StartAttemptRequest {
  readonly userId?: never;
}
//dùng để phân trang lượt làm bài hoặc phân trang theo quiz 
export interface AttemptQuery extends PageQuery {
  quizId?: Uuid;
}
//xem kết quả của câu hỏi
export interface QuestionReviewData {
  questionId: Uuid;
  selectedChoiceIds: Uuid[];
  correctChoiceIds: Uuid[];
  pointsAwarded: number;
  maxPoints: number;
  explanation: string | null;
}
//xem lại cả lượt làm bài
export interface QuizReviewData {
  attemptId: Uuid;
  assessmentVersion: number;
  questions: QuestionReviewData[];
}
//thống kê theo câu hỏi , ví dụ câu này có 7/10 ng làm đúng 
export interface QuestionStatisticsData {
  questionId: Uuid;
  responses: number;
  correctResponses: number; //số lượt trả lời đúng
  difficultyPercent: number | null; //trả về 0 khi  chưa có lượt làm bài nào 
}
//thống kê cả quiz , tương tự câu hỏi 
export interface QuizStatisticsData {
  quizId: Uuid;
  assessmentVersion: number;
  gradedAttempts: number; //số lượt làm bài đã chấm điểm
  averageScorePercent: number | null;
  passRatePercent: number | null;
  questions: QuestionStatisticsData[];
}
