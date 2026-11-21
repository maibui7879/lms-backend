import {
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { RefreshTokenEntity } from '../auth/entities/refresh-token.entity';
import { Role } from './dto/update-role.dto';
import {
  RoleRequestEntity,
  RoleRequestStatus,
} from './entities/role-request.entity';
import { UserAuditEntity } from './entities/user-audit.entity';
import { UserEntity } from './entities/user.entity';
import { UserStatus, UsersService } from './users.service';

describe('UsersService - Optimistic Locking, Session Revocation & Role Workflow', () => {
  let service: UsersService;

  let userRepoMock: {
    findOne: jest.Mock;
    update: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
    count: jest.Mock;
    manager: { transaction: jest.Mock };
  };

  let roleRequestRepoMock: {
    findOne: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
    manager: { transaction: jest.Mock };
  };

  let auditRepoMock: {
    save: jest.Mock;
    create: jest.Mock;
  };

  let refreshTokenRepoMock: {
    update: jest.Mock;
  };

  const makeTransactionMock = () =>
    jest.fn(async (cb: (manager: unknown) => Promise<unknown>) =>
      cb({
        getRepository: (entity: unknown) => {
          if (entity === UserEntity) return userRepoMock;
          if (entity === RefreshTokenEntity) return refreshTokenRepoMock;
          if (entity === UserAuditEntity) return auditRepoMock;
          if (entity === RoleRequestEntity) return roleRequestRepoMock;
          return null;
        },
      }),
    );

  beforeEach(async () => {
    refreshTokenRepoMock = {
      update: jest.fn().mockResolvedValue({ affected: 2 }),
    };

    auditRepoMock = {
      create: jest.fn((d: unknown) => d),
      save: jest.fn((d: unknown) => Promise.resolve(d)),
    };

    userRepoMock = {
      findOne: jest.fn(),
      update: jest.fn(),
      save: jest.fn((u: unknown) => Promise.resolve(u)),
      create: jest.fn((u: unknown) => u),
      count: jest.fn().mockResolvedValue(2),
      manager: { transaction: makeTransactionMock() },
    };

    roleRequestRepoMock = {
      findOne: jest.fn(),
      save: jest.fn((r: unknown) => Promise.resolve(r)),
      create: jest.fn((r: unknown) => r),
      manager: { transaction: makeTransactionMock() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(UserEntity), useValue: userRepoMock },
        {
          provide: getRepositoryToken(RoleRequestEntity),
          useValue: roleRequestRepoMock,
        },
        {
          provide: getRepositoryToken(UserAuditEntity),
          useValue: auditRepoMock,
        },
        {
          provide: getRepositoryToken(RefreshTokenEntity),
          useValue: refreshTokenRepoMock,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  describe('Optimistic Locking (Version Conflict)', () => {
    it('throws 409 ConflictException when updateProfile receives stale expectedVersion', async () => {
      userRepoMock.update.mockResolvedValueOnce({ affected: 0 });
      userRepoMock.findOne.mockResolvedValueOnce({
        id: 'user-1',
        version: 3,
      });

      await expect(
        service.updateProfile('user-1', {
          displayName: 'New Name',
          expectedVersion: 2,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws 409 ConflictException when adminUpdateUserRole receives stale expectedVersion', async () => {
      userRepoMock.findOne.mockResolvedValueOnce({
        id: 'user-1',
        role: 'STUDENT',
        status: UserStatus.ACTIVE,
        version: 5,
      });
      userRepoMock.update.mockResolvedValueOnce({ affected: 0 });

      await expect(
        service.adminUpdateUserRole('admin-1', 'user-1', {
          role: 'INSTRUCTOR',
          reason: 'Promote user',
          expectedVersion: 4,
        }),
      ).rejects.toThrow(ConflictException);

      // Không được revoke session nếu update thất bại do version conflict
      expect(refreshTokenRepoMock.update).not.toHaveBeenCalled();
    });

    it('throws 409 ConflictException when adminUpdateUserStatus receives stale expectedVersion', async () => {
      userRepoMock.findOne.mockResolvedValueOnce({
        id: 'user-1',
        role: 'STUDENT',
        status: UserStatus.ACTIVE,
        version: 2,
      });
      userRepoMock.update.mockResolvedValueOnce({ affected: 0 });

      await expect(
        service.adminUpdateUserStatus('admin-1', 'user-1', {
          status: UserStatus.INACTIVE,
          reason: 'Suspend account',
          expectedVersion: 1,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('Session Revocation on Sensitive Changes', () => {
    it('revokes all active refresh tokens when user changes password', async () => {
      const oldHash = await argon2.hash('OldPass@123');
      userRepoMock.findOne.mockResolvedValueOnce({
        id: 'user-1',
        passwordHash: oldHash,
      });
      userRepoMock.update.mockResolvedValueOnce({ affected: 1 });

      await service.changePassword('user-1', {
        currentPassword: 'OldPass@123',
        newPassword: 'NewPass@456',
      });

      expect(userRepoMock.update).toHaveBeenCalledWith(
        { id: 'user-1' },
        { passwordHash: expect.any(String) },
      );
      expect(refreshTokenRepoMock.update).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1' }),
        expect.objectContaining({ revokedAt: expect.any(Date) }),
      );
    });

    it('throws UnauthorizedException if currentPassword is wrong and does not revoke tokens', async () => {
      const oldHash = await argon2.hash('OldPass@123');
      userRepoMock.findOne.mockResolvedValueOnce({
        id: 'user-1',
        passwordHash: oldHash,
      });

      await expect(
        service.changePassword('user-1', {
          currentPassword: 'WrongPassword',
          newPassword: 'NewPass@456',
        }),
      ).rejects.toThrow(UnauthorizedException);

      expect(refreshTokenRepoMock.update).not.toHaveBeenCalled();
    });

    it('revokes all active refresh tokens and writes audit log when admin updates user role', async () => {
      userRepoMock.findOne
        .mockResolvedValueOnce({
          id: 'user-1',
          role: 'STUDENT',
          status: UserStatus.ACTIVE,
          version: 1,
          createdAt: new Date(),
        })
        .mockResolvedValueOnce({
          id: 'user-1',
          email: 'u@lms.edu.vn',
          displayName: 'User',
          role: 'INSTRUCTOR',
          status: UserStatus.ACTIVE,
          version: 2,
          createdAt: new Date(),
        });
      userRepoMock.update.mockResolvedValueOnce({ affected: 1 });

      const updated = await service.adminUpdateUserRole('admin-1', 'user-1', {
        role: 'INSTRUCTOR',
        reason: 'Verified teaching credentials',
        expectedVersion: 1,
      });

      expect(updated.role).toBe('INSTRUCTOR');
      expect(updated.version).toBe(2);
      expect(refreshTokenRepoMock.update).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1' }),
        expect.objectContaining({ revokedAt: expect.any(Date) }),
      );
      expect(auditRepoMock.save).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          actorId: 'admin-1',
          action: 'ROLE_CHANGED',
        }),
      );
    });

    it('revokes all active refresh tokens when admin disables user status', async () => {
      userRepoMock.findOne
        .mockResolvedValueOnce({
          id: 'user-1',
          role: 'STUDENT',
          status: UserStatus.ACTIVE,
          version: 1,
          createdAt: new Date(),
        })
        .mockResolvedValueOnce({
          id: 'user-1',
          email: 'u@lms.edu.vn',
          displayName: 'User',
          role: 'STUDENT',
          status: UserStatus.INACTIVE,
          version: 2,
          createdAt: new Date(),
        });
      userRepoMock.update.mockResolvedValueOnce({ affected: 1 });

      const updated = await service.adminUpdateUserStatus('admin-1', 'user-1', {
        status: UserStatus.INACTIVE,
        reason: 'Policy violation',
        expectedVersion: 1,
      });

      expect(updated.status).toBe(UserStatus.INACTIVE);
      expect(refreshTokenRepoMock.update).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1' }),
        expect.objectContaining({ revokedAt: expect.any(Date) }),
      );
    });
  });

  describe('Student -> Request -> Admin Review Instructor Upgrade Workflow', () => {
    it('creates pending role request for STUDENT and upgrades role + revokes tokens on APPROVED', async () => {
      userRepoMock.findOne.mockResolvedValueOnce({
        id: 'student-1',
        role: 'STUDENT',
        status: UserStatus.ACTIVE,
        version: 1,
      });
      roleRequestRepoMock.findOne.mockResolvedValueOnce(null);

      const createdReq = await service.createRoleRequest('student-1', {
        reason: 'I have 5 years of teaching backend engineering',
      });
      expect(createdReq.status).toBe(RoleRequestStatus.PENDING);
      expect(createdReq.requestedRole).toBe(Role.INSTRUCTOR);

      // Admin duyệt đơn
      roleRequestRepoMock.findOne.mockResolvedValueOnce({
        id: 'req-1',
        userId: 'student-1',
        requestedRole: Role.INSTRUCTOR,
        status: RoleRequestStatus.PENDING,
      });
      userRepoMock.findOne.mockResolvedValueOnce({
        id: 'student-1',
        role: 'STUDENT',
        version: 1,
      });

      const reviewed = await service.reviewRoleRequest('req-1', 'admin-1', {
        decision: RoleRequestStatus.APPROVED,
        reviewNote: 'Approved',
      });

      expect(reviewed.status).toBe(RoleRequestStatus.APPROVED);
      expect(userRepoMock.update).toHaveBeenCalledWith(
        { id: 'student-1' },
        { role: Role.INSTRUCTOR, version: 2 },
      );
      expect(refreshTokenRepoMock.update).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'student-1' }),
        expect.objectContaining({ revokedAt: expect.any(Date) }),
      );
    });
  });
});