import type { AccountStatus, AuthUser, UserRole } from './auth';
import type { Uuid, ApiResponse } from './common';
import type { PageQuery, VersionRequest } from '../common/pagination';

export interface UserSummary extends AuthUser {
  displayName: string;
  status: AccountStatus;
}
export interface UserProfile extends UserSummary {
  avatarUrl: string | null;
  bio: string | null;
  createdAt: string;
  version: number;
}
export interface UpdateProfileRequest extends VersionRequest {
  displayName?: string;
  avatarUrl?: string | null;
  bio?: string | null;
}
export interface RefreshSessionRequest {
  refreshToken: string;
}
export interface LogoutRequest {
  refreshToken: string;
}
/** Refresh tokens rotate on every refresh; reuse revokes the token family. */
export interface SessionData {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  refreshExpiresAt: string;
  user: AuthUser;
}
export type SessionResponse = ApiResponse<SessionData>;
export type RegisterResponse = ApiResponse<UserProfile>;
export interface AdminUserQuery extends PageQuery {
  search?: string;
  role?: UserRole;
  status?: AccountStatus;
}
export interface UpdateAccountStatusRequest extends VersionRequest {
  status: AccountStatus;
  reason: string;
}
export interface UpdateUserRoleRequest extends VersionRequest {
  role: UserRole;
  reason: string;
}
export interface UserAuditData {
  id: Uuid;
  userId: Uuid;
  actorId: Uuid;
  action: 'STATUS_CHANGED' | 'ROLE_CHANGED';
  reason: string;
  occurredAt: string;
}
export type Permission =
  'COURSE_AUTHOR' | 'COURSE_REVIEW' | 'QUIZ_AUTHOR' | 'LEARN' | 'USER_ADMIN';
export const ROLE_PERMISSIONS = {
  STUDENT: ['LEARN'],
  INSTRUCTOR: ['COURSE_AUTHOR', 'QUIZ_AUTHOR'],
  ADMIN: ['COURSE_REVIEW', 'USER_ADMIN', 'COURSE_AUTHOR', 'QUIZ_AUTHOR'],
} as const satisfies Record<UserRole, readonly Permission[]>;
