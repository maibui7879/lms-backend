export interface JwtAccessPayload {
  sub: string;
  email: string;
  role: string;
  iss?: string;
}