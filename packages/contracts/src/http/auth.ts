import type { ApiResponse, Uuid } from './common';

export type UserRole = 'ADMIN' | 'INSTRUCTOR' | 'STUDENT';
export type AccountStatus = 'ACTIVE' | 'INACTIVE';

export interface AuthUser {
  id: Uuid;
  email: string;
  role: UserRole;
  status?: AccountStatus;
}

export interface JwtClaims {
  sub: Uuid;
  email: string;
  role: UserRole;
  iss: 'identity-service';
  iat: number;
  exp: number;
}

export interface RegisterRequest {
  email: string;
  password: string;
  /** Defaults to STUDENT. Runtime validation must reject ADMIN and unknown roles. */
  role?: Exclude<UserRole, 'ADMIN'>;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginData {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: AuthUser;
}

export type LoginResponse = ApiResponse<LoginData>;
