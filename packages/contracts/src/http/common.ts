export type Uuid = string;

export interface ApiMeta {
  requestId: string;
}

export interface ApiResponse<T> {
  data: T;
  meta: ApiMeta;
}

export interface ApiError {
  code: DomainErrorCode;
  message: string;
  details: Record<string, unknown>;
}

export interface ApiErrorResponse {
  error: ApiError;
  requestId: string;
  timestamp: string;
}

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'ALREADY_ENROLLED'
  | 'COURSE_NOT_PUBLISHED'
  | 'ATTEMPT_LIMIT_REACHED'
  | 'ATTEMPT_ALREADY_SUBMITTED'
  | 'ENROLLMENT_REQUIRED'
  | 'SERVICE_UNAVAILABLE'
  | 'GATEWAY_TIMEOUT';

export type DomainErrorCode =
  | ApiErrorCode
  | 'EMAIL_ALREADY_EXISTS'
  | 'ACCOUNT_INACTIVE'
  | 'INVALID_REFRESH_TOKEN'
  | 'NOT_COURSE_OWNER'
  | 'NOT_ATTEMPT_OWNER'
  | 'INVALID_LESSON_RELATION'
  | 'INVALID_COURSE_TRANSITION'
  | 'INVALID_QUIZ_TRANSITION'
  | 'QUIZ_NOT_AVAILABLE'
  | 'ATTEMPT_EXPIRED'
  | 'INVALID_QUIZ_POLICY'
  | 'INVALID_ANSWER'
  | 'PREREQUISITE_NOT_COMPLETED'
  | 'COURSE_NOT_COMPLETED'
  | 'COURSE_REQUIREMENTS_NOT_MET'
  | 'CERTIFICATE_NOT_ELIGIBLE'
  | 'VERSION_CONFLICT'
  | 'REVISION_CONFLICT'
  | 'IDEMPOTENCY_CONFLICT'
  | 'REVIEW_NOT_AVAILABLE'
  | 'CONTENT_VERSION_MISMATCH'
  | 'INVALID_COURSE_REQUIREMENTS';
