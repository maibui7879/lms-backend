import type { AccountStatus, UserRole } from '@lms/contracts';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { DeepPartial, EntityManager, IsNull, Repository } from 'typeorm';
import { RefreshTokenEntity } from '../auth/entities/refresh-token.entity';
import {
  ListUsersQueryDto,
  UpdateUserRoleDto,
  UpdateUserStatusDto,
} from './dto/admin-users.dto';
import {
  CreateRoleRequestDto,
  ReviewRoleRequestDto,
} from './dto/role-request.dto';
import { ChangePasswordDto, UpdateProfileDto } from './dto/update-profile.dto';
import { Role } from './dto/update-role.dto';
import {
  RoleRequestEntity,
  RoleRequestStatus,
} from './entities/role-request.entity';
import { UserAuditAction, UserAuditEntity } from './entities/user-audit.entity';
import { UserEntity } from './entities/user.entity';

export const UserStatus = {
  ACTIVE: 'ACTIVE' as AccountStatus,
  INACTIVE: 'INACTIVE' as AccountStatus,
};

export { Role, UserEntity };
export type { AccountStatus };

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  displayName: string;
  role?: UserRole;
  status?: AccountStatus;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(RoleRequestEntity)
    private readonly roleRequestRepo: Repository<RoleRequestEntity>,
    @InjectRepository(UserAuditEntity)
    private readonly auditRepo: Repository<UserAuditEntity>,
    @InjectRepository(RefreshTokenEntity)
    private readonly refreshTokenRepo: Repository<RefreshTokenEntity>,
  ) {}

  normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  toUserProfile(user: UserEntity) {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      status: user.status,
      avatarUrl: user.avatarUrl ?? null,
      bio: user.bio ?? null,
      createdAt: user.createdAt.toISOString(),
      version: user.version,
    };
  }

  toUserSummary(user: UserEntity) {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      status: user.status,
    };
  }

  async findByEmail(email: string): Promise<UserEntity | null> {
    return this.userRepo.findOne({
      where: { email: this.normalizeEmail(email) },
    });
  }

  async findById(id: string): Promise<UserEntity | null> {
    return this.userRepo.findOne({ where: { id } });
  }

  async createUser(input: CreateUserInput): Promise<UserEntity> {
    const normalizedEmail = this.normalizeEmail(input.email);
    const existing = await this.findByEmail(normalizedEmail);
    if (existing) {
      throw new ConflictException({
        code: 'EMAIL_ALREADY_EXISTS',
        message: 'Email is already registered',
      });
    }

    const user = this.userRepo.create({
      email: normalizedEmail,
      passwordHash: input.passwordHash,
      displayName: input.displayName.trim(),
      role: input.role ?? 'STUDENT',
      status: input.status ?? UserStatus.ACTIVE,
      version: 1,
    } as DeepPartial<UserEntity>) as UserEntity;

    return this.userRepo.save(user) as Promise<UserEntity>;
  }

  async findOrCreateOAuthUser(input: {
    provider: 'GOOGLE' | 'GITHUB';
    providerId: string;
    email: string;
    displayName: string;
    avatarUrl?: string | null;
  }): Promise<UserEntity> {
    const normalizedEmail = this.normalizeEmail(input.email);
    const existing = await this.findByEmail(normalizedEmail);

    if (existing) {
      if (!existing.oauthProviderId) {
        existing.oauthProvider = input.provider;
        existing.oauthProviderId = input.providerId;
      }
      if (!existing.emailVerifiedAt) {
        existing.emailVerifiedAt = new Date();
      }
      if (!existing.avatarUrl && input.avatarUrl) {
        existing.avatarUrl = input.avatarUrl;
      }
      return this.userRepo.save(existing);
    }

    const created = this.userRepo.create({
      email: normalizedEmail,
      passwordHash: null,
      displayName: input.displayName.trim() || normalizedEmail.split('@')[0],
      avatarUrl: input.avatarUrl ?? null,
      role: 'STUDENT',
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
      oauthProvider: input.provider,
      oauthProviderId: input.providerId,
      version: 1,
    } as DeepPartial<UserEntity>) as UserEntity;

    return this.userRepo.save(created);
  }

  async activateUser(userId: string): Promise<UserEntity> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    }
    user.status = UserStatus.ACTIVE;
    user.emailVerifiedAt = new Date();
    return this.userRepo.save(user);
  }

  async createRoleRequest(userId: string, dto: CreateRoleRequestDto) {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    }

    if (user.role !== 'STUDENT') {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: `Current role (${user.role}) cannot request an upgrade to INSTRUCTOR`,
      });
    }

    const existingPending = await this.roleRequestRepo.findOne({
      where: { userId, status: RoleRequestStatus.PENDING },
    });
    if (existingPending) {
      throw new ConflictException({
        code: 'VERSION_CONFLICT',
        message: 'You already have a pending request waiting for admin review',
      });
    }

    const request = this.roleRequestRepo.create({
      userId,
      requestedRole: Role.INSTRUCTOR,
      reason: dto.reason.trim(),
      status: RoleRequestStatus.PENDING,
    });

    return this.roleRequestRepo.save(request);
  }

  async getMyRoleRequests(userId: string) {
    return this.roleRequestRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async listRoleRequests(status?: RoleRequestStatus) {
    return this.roleRequestRepo.find({
      where: status ? { status } : {},
      relations: { user: true },
      order: { createdAt: 'DESC' },
    });
  }

  async reviewRoleRequest(
    requestId: string,
    adminId: string,
    dto: ReviewRoleRequestDto,
  ) {
    return this.roleRequestRepo.manager.transaction(async (manager) => {
      const reqRepo = manager.getRepository(RoleRequestEntity);
      const userRepo = manager.getRepository(UserEntity);
      const auditRepo = manager.getRepository(UserAuditEntity);
      const tokenRepo = manager.getRepository(RefreshTokenEntity);

      const request = await reqRepo.findOne({ where: { id: requestId } });
      if (!request) {
        throw new NotFoundException({
          code: 'NOT_FOUND',
          message: 'Role request not found',
        });
      }

      if (request.status !== RoleRequestStatus.PENDING) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'This request has already been reviewed',
        });
      }

      request.status = dto.decision;
      request.reviewedBy = adminId;
      request.reviewNote = dto.reviewNote?.trim() ?? null;
      request.reviewedAt = new Date();
      await reqRepo.save(request);

      if (dto.decision === RoleRequestStatus.APPROVED) {
        const targetUser = await userRepo.findOne({
          where: { id: request.userId },
        });
        if (!targetUser) {
          throw new NotFoundException({
            code: 'NOT_FOUND',
            message: 'Target user not found',
          });
        }

        await userRepo.update(
          { id: request.userId },
          {
            role: request.requestedRole,
            version: targetUser.version + 1,
          },
        );

        await tokenRepo.update(
          { userId: request.userId, revokedAt: IsNull() },
          { revokedAt: new Date() },
        );

        await auditRepo.save(
          auditRepo.create({
            userId: request.userId,
            actorId: adminId,
            action: 'ROLE_CHANGED',
            reason:
              dto.reviewNote?.trim() ||
              `Approved role upgrade to ${request.requestedRole}`,
          }),
        );
      }

      return request;
    });
  }

  async getProfile(userId: string) {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    }
    return this.toUserProfile(user);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const patch: Partial<UserEntity> = {
      version: dto.expectedVersion + 1,
    };

    if (dto.displayName !== undefined) {
      const trimmed = dto.displayName.trim();
      if (!trimmed) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'displayName must not be empty',
        });
      }
      patch.displayName = trimmed;
    }

    if (dto.bio !== undefined) {
      patch.bio = dto.bio === null ? null : dto.bio.trim() || null;
    }

    if (dto.avatarUrl !== undefined) {
      patch.avatarUrl =
        dto.avatarUrl === null ? null : dto.avatarUrl.trim() || null;
    }

    const result = await this.userRepo.update(
      { id: userId, version: dto.expectedVersion },
      patch,
    );

    if (!result.affected) {
      const exists = await this.findById(userId);
      if (!exists) {
        throw new NotFoundException({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }
      throw new ConflictException({
        code: 'VERSION_CONFLICT',
        message: 'Profile has been modified by another request',
      });
    }

    const updated = await this.findById(userId);
    if (!updated) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    }

    return this.toUserProfile(updated);
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    }

    if (!user.passwordHash) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message:
          'Account registered via OAuth does not have a local password. Use forgot-password to set one.',
      });
    }

    const isCurrentValid = await argon2.verify(
      user.passwordHash,
      dto.currentPassword,
    );
    if (!isCurrentValid) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Current password is incorrect',
      });
    }

    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'New password must be different from current password',
      });
    }

    const newPasswordHash = await argon2.hash(dto.newPassword, {
      type: argon2.argon2id,
    });

    await this.userRepo.manager.transaction(async (manager) => {
      const userRepo = manager.getRepository(UserEntity);
      const tokenRepo = manager.getRepository(RefreshTokenEntity);

      await userRepo.update({ id: userId }, { passwordHash: newPasswordHash });
      await tokenRepo.update(
        { userId, revokedAt: IsNull() },
        { revokedAt: new Date() },
      );
    });
  }

  async resetUserPassword(
    userId: string,
    newPasswordHash: string,
  ): Promise<void> {
    await this.userRepo.manager.transaction(async (manager) => {
      const userRepo = manager.getRepository(UserEntity);
      const tokenRepo = manager.getRepository(RefreshTokenEntity);

      await userRepo.update({ id: userId }, { passwordHash: newPasswordHash });
      await tokenRepo.update(
        { userId, revokedAt: IsNull() },
        { revokedAt: new Date() },
      );
    });
  }

  private async ensureNotLastActiveAdmin(
    manager: EntityManager,
    targetUser: UserEntity,
  ): Promise<void> {
    if (
      targetUser.role === 'ADMIN' &&
      targetUser.status === UserStatus.ACTIVE
    ) {
      const activeAdminCount = await manager.getRepository(UserEntity).count({
        where: { role: 'ADMIN', status: UserStatus.ACTIVE },
      });
      if (activeAdminCount <= 1) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'Cannot demote or disable the last active ADMIN account',
        });
      }
    }
  }

  async listUsersPaginated(query: ListUsersQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const qb = this.userRepo.createQueryBuilder('u');

    if (query.role) {
      qb.andWhere('u.role = :role', { role: query.role });
    }
    if (query.status) {
      qb.andWhere('u.status = :status', { status: query.status });
    }
    if (query.search?.trim()) {
      const term = `%${query.search.trim()}%`;
      qb.andWhere('(u.email ILIKE :term OR u.displayName ILIKE :term)', {
        term,
      });
    }

    qb.orderBy('u.createdAt', 'DESC').skip(skip).take(limit);

    const [items, total] = await qb.getManyAndCount();

    return {
      items: items.map((u) => this.toUserSummary(u)),
      page,
      limit,
      total,
    };
  }

  async adminUpdateUserStatus(
    actorId: string,
    targetUserId: string,
    dto: UpdateUserStatusDto,
  ) {
    if (actorId === targetUserId && dto.status !== UserStatus.ACTIVE) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Admin cannot disable their own account',
      });
    }

    return this.userRepo.manager.transaction(async (manager) => {
      const userRepo = manager.getRepository(UserEntity);
      const tokenRepo = manager.getRepository(RefreshTokenEntity);
      const auditRepo = manager.getRepository(UserAuditEntity);

      const user = await userRepo.findOne({ where: { id: targetUserId } });
      if (!user) {
        throw new NotFoundException({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      if (dto.status !== UserStatus.ACTIVE) {
        await this.ensureNotLastActiveAdmin(manager, user);
      }

      const result = await userRepo.update(
        { id: targetUserId, version: dto.expectedVersion },
        { status: dto.status, version: dto.expectedVersion + 1 },
      );

      if (!result.affected) {
        throw new ConflictException({
          code: 'VERSION_CONFLICT',
          message: 'User record has been modified by another request',
        });
      }

      await tokenRepo.update(
        { userId: targetUserId, revokedAt: IsNull() },
        { revokedAt: new Date() },
      );

      await auditRepo.save(
        auditRepo.create({
          userId: targetUserId,
          actorId,
          action: 'STATUS_CHANGED' as UserAuditAction,
          reason: dto.reason.trim(),
        }),
      );

      const updated = await userRepo.findOne({ where: { id: targetUserId } });
      if (!updated) {
        throw new NotFoundException({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      return this.toUserProfile(updated);
    });
  }

  async adminUpdateUserRole(
    actorId: string,
    targetUserId: string,
    dto: UpdateUserRoleDto,
  ) {
    return this.userRepo.manager.transaction(async (manager) => {
      const userRepo = manager.getRepository(UserEntity);
      const tokenRepo = manager.getRepository(RefreshTokenEntity);
      const auditRepo = manager.getRepository(UserAuditEntity);

      const user = await userRepo.findOne({ where: { id: targetUserId } });
      if (!user) {
        throw new NotFoundException({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      if (user.role === 'ADMIN' && dto.role !== 'ADMIN') {
        await this.ensureNotLastActiveAdmin(manager, user);
      }

      const result = await userRepo.update(
        { id: targetUserId, version: dto.expectedVersion },
        { role: dto.role, version: dto.expectedVersion + 1 },
      );

      if (!result.affected) {
        throw new ConflictException({
          code: 'VERSION_CONFLICT',
          message: 'User record has been modified by another request',
        });
      }

      await tokenRepo.update(
        { userId: targetUserId, revokedAt: IsNull() },
        { revokedAt: new Date() },
      );

      await auditRepo.save(
        auditRepo.create({
          userId: targetUserId,
          actorId,
          action: 'ROLE_CHANGED',
          reason: dto.reason.trim(),
        }),
      );

      const updated = await userRepo.findOne({ where: { id: targetUserId } });
      if (!updated) {
        throw new NotFoundException({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      return this.toUserProfile(updated);
    });
  }

  async listUserAudits(userId: string, page = 1, limit = 20) {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    }

    const skip = (page - 1) * limit;
    const [items, total] = await this.auditRepo.findAndCount({
      where: { userId },
      order: { occurredAt: 'DESC' },
      skip,
      take: limit,
    });

    return {
      items: items.map((a) => ({
        id: a.id,
        userId: a.userId,
        actorId: a.actorId,
        action: a.action,
        reason: a.reason,
        occurredAt: a.occurredAt.toISOString(),
      })),
      page,
      limit,
      total,
    };
  }

  async getInternalUserSummary(userId: string) {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    }

    return this.toUserSummary(user);
  }

  async getInternalUserAccessStatus(userId: string) {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    }

    return {
      userId: user.id,
      status: user.status,
      role: user.role,
    };
  }
}
