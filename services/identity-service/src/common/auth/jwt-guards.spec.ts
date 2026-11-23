import 'reflect-metadata';
import { generateKeyPairSync } from 'node:crypto';
import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AuthController } from '../../modules/auth/auth.controller';
import { AdminUsersController } from '../../modules/users/admin-users.controller';
import { UsersController } from '../../modules/users/users.controller';
import { Role, UsersService } from '../../modules/users/users.service';
import { JwtAuthGuard, RolesGuard } from './guards';
import { JwtAccessPayload } from './jwt-payload.interface';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy + JwtAuthGuard + RolesGuard (Protected Controllers)', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const { privateKey: foreignPrivateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const jwtService = new JwtService({
    privateKey,
    publicKey,
    signOptions: {
      algorithm: 'RS256',
      issuer: 'lms-identity',
      expiresIn: 900,
    },
    verifyOptions: {
      algorithms: ['RS256'],
      issuer: 'lms-identity',
    },
  });

  const mockUsersService = {
    findById: jest.fn((userId: string) =>
      Promise.resolve(
        userId === 'admin-001'
          ? {
              id: 'admin-001',
              email: 'admin@lms.edu.vn',
              role: Role.ADMIN,
              status: 'ACTIVE',
            }
          : userId === 'student-123'
            ? {
                id: 'student-123',
                email: 'student@lms.edu.vn',
                role: Role.STUDENT,
                status: 'ACTIVE',
              }
            : null,
      ),
    ),
  } as unknown as UsersService;

  const configService = {
    getOrThrow: jest.fn((key: string) => {
      if (key === 'JWT_PUBLIC_KEY') return publicKey;
      if (key === 'JWT_ISSUER') return 'lms-identity';
      throw new Error(`Unexpected config key: ${key}`);
    }),
  } as unknown as ConfigService;

  const reflector = new Reflector();
  const jwtStrategy = new JwtStrategy(configService, mockUsersService);
  const rolesGuard = new RolesGuard(reflector);

  class TestJwtAuthGuard extends JwtAuthGuard {
    constructor() {
      super(reflector);
    }

    override async canActivate(context: ExecutionContext): Promise<boolean> {
      const req = context.switchToHttp().getRequest<{
        headers?: { authorization?: string };
        user?: JwtAccessPayload;
      }>();

      // Nếu không có header Authorization, gọi thẳng super.canActivate(context)
      // để kiểm tra nhánh @Public() của JwtAuthGuard thật
      if (!req.headers?.authorization) {
        try {
          const allowed = await super.canActivate(context);
          if (allowed) {
            return true;
          }
        } catch {
          // Non-public route sẽ bị từ chối khi thiếu Bearer token
        }
        throw new UnauthorizedException({
          code: 'UNAUTHORIZED',
          message: 'Missing Bearer token',
        });
      }

      const authHeader = req.headers.authorization;
      if (!authHeader.startsWith('Bearer ')) {
        throw new UnauthorizedException({
          code: 'UNAUTHORIZED',
          message: 'Invalid Authorization header',
        });
      }

      const token = authHeader.slice(7).trim();
      let decoded: JwtAccessPayload;
      try {
        decoded = await jwtService.verifyAsync<JwtAccessPayload>(token);
      } catch {
        throw new UnauthorizedException({
          code: 'UNAUTHORIZED',
          message: 'Invalid or expired JWT token',
        });
      }

      req.user = await jwtStrategy.validate(decoded);
      return true;
    }
  }

  const jwtAuthGuard = new TestJwtAuthGuard();

  const makeContext = (
    controllerClass: new (...args: never[]) => unknown,
    methodName: string,
    authHeader?: string,
  ): ExecutionContext => {
    const req: {
      headers: Record<string, string>;
      user?: JwtAccessPayload;
    } = {
      headers: authHeader ? { authorization: authHeader } : {},
    };

    const handler = (controllerClass.prototype as Record<string, unknown>)[
      methodName
    ] as (() => unknown) | undefined;

    if (!handler) {
      throw new Error(
        `Method "${methodName}" does not exist on ${controllerClass.name}`,
      );
    }

    return {
      getClass: () => controllerClass,
      getHandler: () => handler,
      switchToHttp: () => ({
        getRequest: () => req,
      }),
    } as unknown as ExecutionContext;
  };

  it('allows @Public() route on AuthController without Bearer token', async () => {
    const publicMethodName = Object.getOwnPropertyNames(
      AuthController.prototype,
    ).find((name) => {
      if (name === 'constructor') return false;
      const fn = (
        AuthController.prototype as unknown as Record<string, unknown>
      )[name];
      if (typeof fn !== 'function') return false;
      return Reflect.getMetadataKeys(fn).some(
        (key) => Reflect.getMetadata(key, fn) === true,
      );
    });

    expect(publicMethodName).toBeDefined();
    const ctx = makeContext(AuthController, publicMethodName!);
    await expect(jwtAuthGuard.canActivate(ctx)).resolves.toBe(true);
  });
  it('rejects protected routes (UsersController.getMe, AuthController.logoutAll, AdminUsersController.listUsers) when Bearer token is missing', async () => {
    await expect(
      jwtAuthGuard.canActivate(makeContext(UsersController, 'getMe')),
    ).rejects.toThrow(UnauthorizedException);

    await expect(
      jwtAuthGuard.canActivate(makeContext(AuthController, 'logoutAll')),
    ).rejects.toThrow(UnauthorizedException);

    await expect(
      jwtAuthGuard.canActivate(makeContext(AdminUsersController, 'listUsers')),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects forged RS256 token or wrong issuer with UnauthorizedException', async () => {
    const forgedToken = await jwtService.signAsync(
      { sub: 'student-123', email: 'student@lms.edu.vn', role: Role.STUDENT },
      {
        privateKey: foreignPrivateKey,
        algorithm: 'RS256',
        issuer: 'lms-identity',
      },
    );

    await expect(
      jwtAuthGuard.canActivate(
        makeContext(UsersController, 'getMe', `Bearer ${forgedToken}`),
      ),
    ).rejects.toThrow(UnauthorizedException);

    const wrongIssuerToken = await jwtService.signAsync(
      { sub: 'student-123', email: 'student@lms.edu.vn', role: Role.STUDENT },
      { issuer: 'wrong-issuer' },
    );

    await expect(
      jwtAuthGuard.canActivate(
        makeContext(UsersController, 'getMe', `Bearer ${wrongIssuerToken}`),
      ),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('allows valid STUDENT token on UsersController.getMe and AuthController.logoutAll via JwtStrategy', async () => {
    const studentToken = await jwtService.signAsync({
      sub: 'student-123',
      email: 'student@lms.edu.vn',
      role: Role.STUDENT,
    });

    const getMeCtx = makeContext(
      UsersController,
      'getMe',
      `Bearer ${studentToken}`,
    );
    await expect(jwtAuthGuard.canActivate(getMeCtx)).resolves.toBe(true);
    expect(rolesGuard.canActivate(getMeCtx)).toBe(true);

    const logoutAllCtx = makeContext(
      AuthController,
      'logoutAll',
      `Bearer ${studentToken}`,
    );
    await expect(jwtAuthGuard.canActivate(logoutAllCtx)).resolves.toBe(true);
    expect(rolesGuard.canActivate(logoutAllCtx)).toBe(true);
  });

  it('blocks STUDENT with ForbiddenException on AdminUsersController.listUsers and allows ADMIN', async () => {
    const studentToken = await jwtService.signAsync({
      sub: 'student-123',
      email: 'student@lms.edu.vn',
      role: Role.STUDENT,
    });

    const studentAdminCtx = makeContext(
      AdminUsersController,
      'listUsers',
      `Bearer ${studentToken}`,
    );
    await expect(jwtAuthGuard.canActivate(studentAdminCtx)).resolves.toBe(true);
    expect(() => rolesGuard.canActivate(studentAdminCtx)).toThrow(
      ForbiddenException,
    );

    const adminToken = await jwtService.signAsync({
      sub: 'admin-001',
      email: 'admin@lms.edu.vn',
      role: Role.ADMIN,
    });

    const adminCtx = makeContext(
      AdminUsersController,
      'listUsers',
      `Bearer ${adminToken}`,
    );
    await expect(jwtAuthGuard.canActivate(adminCtx)).resolves.toBe(true);
    expect(rolesGuard.canActivate(adminCtx)).toBe(true);
  });
});
