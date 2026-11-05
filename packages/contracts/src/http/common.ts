export type Uuid = string;

export interface ApiMeta {
  requestId: string;
}

export interface ApiResponse<T> {
  data: T;
  meta: ApiMeta;
}

export interface ApiError {
  code: string;
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
