import type { Uuid } from './common';
import type {
  PageQuery,
  ReorderRequest,
  VersionRequest,
} from '../common/pagination';
import type { EnrollmentSnapshotData } from './enrollment';

export type CourseStatus = 'DRAFT' | 'IN_REVIEW' | 'PUBLISHED' | 'REJECTED';
export type CourseLevel =
  'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'ALL_LEVELS';
/** Thông tin bổ sung tùy chọn để tương thích với khóa học đã tồn tại. */
export interface CourseMetadata {
  subtitle?: string;
  category?: string;
  tags?: string[];
  level?: CourseLevel;
  /** Mã ngôn ngữ BCP 47, ví dụ vi hoặc en-US. */
  language?: string;
  prerequisites?: string[];
  targetAudience?: string[];
  learningOutcomes?: string[];
  /** Không truyền thì description được hiểu là văn bản thuần. */
  descriptionFormat?: 'PLAIN_TEXT' | 'HTML';
}
export interface CourseData extends CourseMetadata {
  id: Uuid;
  instructorId: Uuid;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  status: CourseStatus;
  version: number;
  contentVersion: number;
  createdAt: string;
  updatedAt: string;
}
export type CourseRevisionStatus =
  'DRAFT' | 'IN_REVIEW' | 'PUBLISHED' | 'REJECTED';
export type RevisionUpdateType = 'NORMAL' | 'CRITICAL';
export type MigrationPolicy =
  'KEEP_ENROLLED_VERSION' | 'MIGRATE_AFFECTED_ITEMS';
export interface CourseRevisionData {
  id: Uuid;
  courseId: Uuid;
  baseContentVersion: number;
  contentVersion: number | null;
  status: CourseRevisionStatus;
  createdBy: Uuid;
  createdAt: string;
  submittedAt: string | null;
  publishedAt: string | null;
  version: number;
  updateType: RevisionUpdateType;
  migrationPolicy: MigrationPolicy;
}
export interface CreateCourseRevisionRequest {
  baseContentVersion: number;
  updateType: RevisionUpdateType;
  migrationPolicy: MigrationPolicy;
}
export interface ReviewCourseRevisionRequest extends VersionRequest {
  decision: 'APPROVE' | 'REJECT';
  reason?: string;
}
export type RevisionEntityType =
  'CHAPTER' | 'LESSON' | 'LEARNING_ITEM' | 'QUIZ';
export type RevisionChangeType = 'ADDED' | 'UPDATED' | 'DELETED';
export interface CourseRevisionChangeData {
  id: Uuid;
  revisionId: Uuid;
  entityType: RevisionEntityType;
  entityId: Uuid;
  changeType: RevisionChangeType;
  oldVersion: number | null;
  newVersion: number | null;
  isCritical: boolean;
  summary: string;
  createdAt: string;
}
export interface CoursePatchNoticeData {
  id: Uuid;
  courseId: Uuid;
  revisionId: Uuid;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  title: string;
  message: string;
  requiresAction: boolean;
  publishedAt: string;
}
export interface MigrateCourseItemsRequest {
  revisionId: Uuid;
  itemIds: Uuid[];
  reason: string;
  policy: 'REQUIRE_RECOMPLETION' | 'NOTIFY_ONLY';
}
export interface RevisionVersionRequest extends VersionRequest {
  /** Chỉ bắt buộc khi thao tác trên một CourseRevision cụ thể. */
  revisionId?: Uuid;
}
export interface RevisionReorderRequest extends ReorderRequest {
  /** Chỉ bắt buộc khi reorder nội dung thuộc một CourseRevision cụ thể. */
  revisionId?: Uuid;
}
export interface CreateCourseRequest extends CourseMetadata {
  title: string;
  description: string;
  thumbnailUrl?: string | null;
}
export type UpdateCourseRequest = Partial<CreateCourseRequest> & VersionRequest;
export interface CourseQuery extends PageQuery {
  search?: string;
  instructorId?: Uuid;
  category?: string;
  tag?: string;
  level?: CourseLevel;
  language?: string;
  sort?: 'createdAt' | 'title';
  direction?: 'asc' | 'desc';
}
export interface InstructorCourseQuery extends CourseQuery {
  status?: CourseStatus;
}
export type ReviewCourseRequest = VersionRequest &
  (
    | { decision: 'APPROVE'; reason?: never }
    | { decision: 'REJECT'; reason: string }
  );
export interface CourseReviewData {
  id: Uuid;
  courseId: Uuid;
  decision: 'APPROVE' | 'REJECT';
  status: 'PUBLISHED' | 'REJECTED';
  reviewedBy: Uuid;
  reviewedAt: string;
  rejectionReason: string | null;
  version: number;
}
export interface ChapterData {
  id: Uuid;
  courseId: Uuid;
  revisionId: Uuid;
  title: string;
  order: number;
  version: number;
  endSectionQuiz: SectionEndQuizRef | null;
}
export interface SectionEndQuizRef {
  quizId: Uuid;
  assessmentVersion: number;
  passingScorePercent: number;
}
export interface CreateChapterRequest {
  revisionId?: Uuid;
  title: string;
  endSectionQuiz?: SectionEndQuizRef | null;
}
export type UpdateChapterRequest = CreateChapterRequest &
  RevisionVersionRequest;
export interface LessonData {
  id: Uuid;
  courseId: Uuid;
  revisionId: Uuid;
  chapterId: Uuid;
  title: string;
  order: number;
  version: number;
}
export interface CreateLessonRequest {
  revisionId?: Uuid;
  title: string;
}
export type UpdateLessonRequest = CreateLessonRequest & RevisionVersionRequest;
/** Tệp đã upload; không gửi dữ liệu nhị phân/base64 vào request tạo bài học. */
export interface LearningItemAttachment {
  fileName: string;
  fileUrl: string;
  mimeType: string;
  sizeBytes: number;
}
export type LearningItemContent =
  | {
      type: 'VIDEO';
      videoUrl: string;
      durationSeconds: number;
      attachments?: LearningItemAttachment[];
    }
  | {
      type: 'READING';
      body: string;
      /** Mặc định PLAIN_TEXT cho nội dung cũ; HTML hỗ trợ ảnh qua URL. */
      bodyFormat?: 'PLAIN_TEXT' | 'HTML';
    }
  | { type: 'QUIZ'; quizId: Uuid; assessmentVersion: number };
export type CreateLearningItemRequest = LearningItemContent & {
  revisionId?: Uuid;
  title: string;
  required: boolean;
};
export type UpdateLearningItemRequest = CreateLearningItemRequest &
  RevisionVersionRequest;
export type LearningItemData = CreateLearningItemRequest & {
  id: Uuid;
  courseId: Uuid;
  lessonId: Uuid;
  order: number;
  contentVersion: number;
  version: number;
};
export interface LessonOutline extends LessonData {
  items: LearningItemData[];
  /** Skills reinforced by this lesson in the published content snapshot. */
  skillIds?: Uuid[];
}
export interface ChapterOutline extends ChapterData {
  lessons: LessonOutline[];
}
export interface CourseOutlineData {
  courseId: Uuid;
  revisionId: Uuid;
  contentVersion: number;
  chapters: ChapterOutline[];
}
export interface RequiredAssessment {
  quizId: Uuid;
  assessmentVersion: number;
  passingScorePercent: number;
}
export interface ChapterCompletionPolicy {
  chapterId: Uuid;
  requiredItemIds: Uuid[];
  requiredAssessments: RequiredAssessment[];
}
/** Immutable once published; an enrollment pins this snapshot. */
export interface CourseCompletionPolicy {
  courseId: Uuid;
  contentVersion: number;
  requiredItemIds: Uuid[];
  requiredAssessments: RequiredAssessment[];
  chapterPolicies: ChapterCompletionPolicy[];
  sequence: 'FREE' | 'SEQUENTIAL';
  assessmentRule: 'ANY_PASSED_ATTEMPT_SAME_VERSION';
  certificateEnabled: boolean;
}
export type UpdateCompletionPolicyRequest = Pick<
  CourseCompletionPolicy,
  'sequence' | 'certificateEnabled' | 'requiredAssessments' | 'chapterPolicies'
> &
  VersionRequest;
export interface EnrolledCourseData {
  enrollment: EnrollmentSnapshotData;
  course: CourseData;
}
export interface CourseLearnerData {
  userId: Uuid;
  enrollment: EnrollmentSnapshotData;
  /** Course can provide the class of this enrollment. Null means unassigned. */
  classId?: Uuid | null;
}
export interface DiscussionData {
  id: Uuid;
  courseId: Uuid;
  lessonId: Uuid | null;
  parentId: Uuid | null;
  authorId: Uuid;
  body: string;
  pinned: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}
export interface CreateDiscussionRequest {
  body: string;
  lessonId?: Uuid;
  parentId?: Uuid;
}
export interface UpdateDiscussionRequest extends VersionRequest {
  body: string;
}
export interface PinDiscussionRequest extends VersionRequest {
  pinned: boolean;
}
