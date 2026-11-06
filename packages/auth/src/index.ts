import { createParamDecorator, UnauthorizedException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { AuthUser, UserRole } from '@lms/contracts';
import ids from '@lms/contracts/fixtures/ids.json';

export type MockUserName = keyof typeof ids.users;

export interface AuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>;
  user?: AuthUser;
}

const roles: Record<MockUserName, UserRole> = {
  studentA: 'STUDENT',
  studentB: 'STUDENT',
  studentC: 'STUDENT',
  studentD: 'STUDENT',
  instructorA: 'INSTRUCTOR',
  instructorB: 'INSTRUCTOR',
  adminA: 'ADMIN',
};

export function getMockUser(name: MockUserName): AuthUser {
  return {
    id: ids.users[name],
    email: `${name}@example.test`,
    role: roles[name],
    status: 'ACTIVE',
  };
}

/** Local/test only. This guard does NOT verify JWTs or enforce ownership/RBAC. */
export class MockAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (
      process.env.MOCK_AUTH !== 'true' ||
      !['development', 'test'].includes(process.env.NODE_ENV ?? '')
    ) {
      throw new UnauthorizedException('Mock authentication is disabled');
    }
    if (context.getType() !== 'http') {
      throw new UnauthorizedException('Mock authentication supports HTTP only');
    }
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    // Never preserve an unverified identity from another middleware.
    delete request.user;
    const name = request.headers['x-mock-user'];
    if (typeof name !== 'string' || !Object.hasOwn(roles, name)) {
      throw new UnauthorizedException(
        'A valid x-mock-user fixture name is required',
      );
    }
    request.user = getMockUser(name as MockUserName);
    return true;
  }
}

/** Read the AuthUser attached by an authentication guard. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser => {
    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
    if (!user) throw new UnauthorizedException();
    return user;
  },
);
