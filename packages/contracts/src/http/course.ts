import type { Uuid } from './common';
import type {
  PageQuery,
  ReorderRequest,
  VersionRequest,
} from '../common/pagination';
import type { EnrollmentSnapshotData } from './enrollment';

export type CourseStatus = 'DRAFT' | 'IN_REVIEW' | 'PUBLISHED' | 'REJECTED';
export interface CourseData {
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
}
export interface CreateCourseRevisionRequest {
  baseContentVersion: number;
}
export interface ReviewCourseRevisionRequest extends VersionRequest {
  decision: 'APPROVE' | 'REJECT';
  reason?: string;
}
export interface RevisionVersionRequest extends VersionRequest {
  /** Chỉ bắt buộc khi thao tác trên một CourseRevision cụ thể. */
  revisionId?: Uuid;
}
export interface RevisionReorderRequest extends ReorderRequest {
  /** Chỉ bắt buộc khi reorder nội dung thuộc một CourseRevision cụ thể. */
  revisionId?: Uuid;
}
export interface CreateCourseRequest {
  title: string;
  description: string;
  thumbnailUrl?: string | null;
}
export interface UpdateCourseRequest extends VersionRequest {
  title?: string;
  description?: string;
  thumbnailUrl?: string | null;
}
export interface CourseQuery extends PageQuery {
  search?: string;
  instructorId?: Uuid;
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
export interface UpdateChapterRequest extends RevisionVersionRequest {
  title: string;
  endSectionQuiz?: SectionEndQuizRef | null;
}
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
export interface UpdateLessonRequest extends RevisionVersionRequest {
  title: string;
}
export type LearningItemContent =
  | { type: 'VIDEO'; videoUrl: string; durationSeconds: number }
  | { type: 'READING'; body: string }
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
export interface UpdateCompletionPolicyRequest extends VersionRequest {
  sequence: 'FREE' | 'SEQUENTIAL';
  certificateEnabled: boolean;
  requiredAssessments: RequiredAssessment[];
  chapterPolicies: ChapterCompletionPolicy[];
}
export interface EnrolledCourseData {
  enrollment: EnrollmentSnapshotData;
  course: CourseData;
}
export interface CourseLearnerData {
  userId: Uuid;
  enrollment: EnrollmentSnapshotData;
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
