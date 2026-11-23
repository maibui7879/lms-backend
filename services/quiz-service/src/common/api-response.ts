import type { ApiResponse } from '@lms/contracts';

export function apiResponse<T>(data: T, requestId: string): ApiResponse<T> {
  return {
    data,
    meta: { requestId },
  };
}
