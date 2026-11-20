import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, IsNull, Repository } from 'typeorm';
import {
  CreateRoleRequestDto,
  ReviewRoleRequestDto,
} from './dto/role-request.dto';
import { Role } from './dto/update-role.dto';
import {
  RoleRequestEntity,
  RoleRequestStatus,
} from './entities/role-request.entity';
import { UserEntity } from './entities/user.entity';
import * as argon2 from 'argon2';
import { ChangePasswordDto, UpdateProfileDto } from './dto/update-profile.dto';
import { RefreshTokenEntity } from '../auth/entities/refresh-token.entity';
import { AdminAuditAction, AdminAuditLogEntity } from './entities/admin-audit-log.entity';
import { ListUsersQueryDto, UpdateUserStatusDto } from './dto/admin-users.dto';
import type { AccountStatus } from '@lms/contracts';

export const UserStatus = {
  ACTIVE: 'ACTIVE' as AccountStatus,
  INACTIVE: 'INACTIVE' as AccountStatus,
  BLOCKED: 'BLOCKED' as AccountStatus,
};

export { Role, UserEntity };
export type { AccountStatus };

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  displayName: string;
  role?: Role;
  status?: AccountStatus;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(RoleRequestEntity)
    private readonly roleRequestRepo: Repository<RoleRequestEntity>,
    @InjectRepository(AdminAuditLogEntity)
    private readonly auditLogRepo: Repository<AdminAuditLogEntity>,
    @InjectRepository(RefreshTokenEntity)
    private readonly refreshTokenRepo: Repository<RefreshTokenEntity>,
  ) {}

  normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
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
      role: input.role ?? Role.STUDENT,
      status: input.status ?? UserStatus.ACTIVE,
    } as DeepPartial<UserEntity>) as UserEntity;

    return this.userRepo.save(user) as Promise<UserEntity>;
  }

 async activateUser(userId: string): Promise<UserEntity> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'User not found',
      });
    }
    user.status = UserStatus.ACTIVE; 
    user.emailVerifiedAt = new Date();
    return this.userRepo.save(user);
  }

  async updateRole(userId: string, role: Role): Promise<UserEntity> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'User not found',
      });
    }
    user.role = role;
    return this.userRepo.save(user);
  }

  async createRoleRequest(userId: string, dto: CreateRoleRequestDto) {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'User not found',
      });
    }

    if (user.role !== Role.STUDENT) {
      throw new BadRequestException({
        code: 'ROLE_REQUEST_NOT_ALLOWED',
        message: `Current role (${user.role}) cannot request an upgrade to INSTRUCTOR`,
      });
    }

    const existingPending = await this.roleRequestRepo.findOne({
      where: { userId, status: RoleRequestStatus.PENDING },
    });
    if (existingPending) {
      throw new ConflictException({
        code: 'ROLE_REQUEST_PENDING',
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
      const auditRepo = manager.getRepository(AdminAuditLogEntity);
      const tokenRepo = manager.getRepository(RefreshTokenEntity);

      const request = await reqRepo.findOne({ where: { id: requestId } });
      if (!request) {
        throw new NotFoundException({
          code: 'ROLE_REQUEST_NOT_FOUND',
          message: 'Role request not found',
        });
      }

      if (request.status !== RoleRequestStatus.PENDING) {
        throw new BadRequestException({
          code: 'ROLE_REQUEST_ALREADY_REVIEWED',
          message: 'This request has already been reviewed',
        });
      }

      request.status = dto.decision;
      request.reviewedBy = adminId;
      request.reviewNote = dto.reviewNote?.trim() ?? null;
      request.reviewedAt = new Date();
      await reqRepo.save(request);

      if (dto.decision === RoleRequestStatus.APPROVED) {
        await userRepo.update(
          { id: request.userId },
          { role: request.requestedRole },
        );

        await tokenRepo.update(
          { userId: request.userId, revokedAt: IsNull() },
          { revokedAt: new Date() },
        );
      }

      await auditRepo.save(
        auditRepo.create({
          actorId: adminId,
          targetUserId: request.userId,
          action:
            dto.decision === RoleRequestStatus.APPROVED
              ? AdminAuditAction.APPROVE_ROLE_REQUEST
              : AdminAuditAction.REJECT_ROLE_REQUEST,
          metadata: {
            requestId: request.id,
            requestedRole: request.requestedRole,
            decision: dto.decision,
          },
          reason: dto.reviewNote?.trim() ?? null,
        }),
      );

      return request;
    });
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<UserEntity> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'User not found',
      });
    }

    if (dto.displayName !== undefined) {
      user.displayName = dto.displayName.trim();
    }
    if (dto.bio !== undefined) {
      user.bio = dto.bio.trim() || null;
    }
    if (dto.avatarUrl !== undefined) {
      user.avatarUrl = dto.avatarUrl.trim() || null;
    }

    return this.userRepo.save(user);
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'User not found',
      });
    }

    const isCurrentValid = await argon2.verify(
      user.passwordHash,
      dto.currentPassword,
    );
    if (!isCurrentValid) {
      throw new UnauthorizedException({
        code: 'INVALID_CURRENT_PASSWORD',
        message: 'Current password is incorrect',
      });
    }

    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException({
        code: 'SAME_PASSWORD',
        message: 'New password must be different from current password',
      });
    }

    user.passwordHash = await argon2.hash(dto.newPassword, {
      type: argon2.argon2id,
    });
    await this.userRepo.save(user);
  }

  private async revokeAllUserSessions(userId: string): Promise<void> {
    await this.refreshTokenRepo.update(
      { userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  private async ensureNotLastActiveAdmin(targetUser: UserEntity): Promise<void> {
    if (
      targetUser.role === Role.ADMIN &&
      targetUser.status === UserStatus.ACTIVE
    ) {
      const activeAdminCount = await this.userRepo.count({
        where: { role: Role.ADMIN, status: UserStatus.ACTIVE },
      });
      if (activeAdminCount <= 1) {
        throw new BadRequestException({
          code: 'LAST_ACTIVE_ADMIN',
          message: 'Cannot demote or disable the last active ADMIN account',
        });
      }
    }
  }

  async writeAuditLog(params: {
    actorId: string;
    targetUserId: string;
    action: AdminAuditAction;
    metadata?: Record<string, unknown>;
    reason?: string | null;
  }) {
    const log = this.auditLogRepo.create({
      actorId: params.actorId,
      targetUserId: params.targetUserId,
      action: params.action,
      metadata: params.metadata ?? null,
      reason: params.reason ?? null,
    });
    return this.auditLogRepo.save(log);
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
      items: items.map((u) => ({
        id: u.id,
        email: u.email,
        displayName: u.displayName,
        role: u.role,
        status: u.status,
        avatarUrl: u.avatarUrl ?? null,
        emailVerifiedAt: u.emailVerifiedAt?.toISOString() ?? null,
        createdAt: u.createdAt.toISOString(),
        updatedAt: u.updatedAt.toISOString(),
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async adminUpdateUserStatus(
    actorId: string,
    targetUserId: string,
    dto: UpdateUserStatusDto,
  ) {
    if (actorId === targetUserId && dto.status !== UserStatus.ACTIVE) {
      throw new BadRequestException({
        code: 'SELF_DISABLE_FORBIDDEN',
        message: 'Admin cannot disable their own account',
      });
    }

    const user = await this.findById(targetUserId);
    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'User not found',
      });
    }

    if (dto.status !== UserStatus.ACTIVE) {
      await this.ensureNotLastActiveAdmin(user);
    }

    const previousStatus = user.status;
    user.status = dto.status;
    const saved = await this.userRepo.save(user);

    if (dto.status !== UserStatus.ACTIVE) {
      await this.revokeAllUserSessions(targetUserId);
    }

    await this.writeAuditLog({
      actorId,
      targetUserId,
      action: AdminAuditAction.CHANGE_STATUS,
      metadata: { previousStatus, newStatus: dto.status },
      reason: dto.reason ?? null,
    });

    return {
      id: saved.id,
      email: saved.email,
      displayName: saved.displayName,
      role: saved.role,
      status: saved.status,
      updatedAt: saved.updatedAt.toISOString(),
    };
  }

  async adminUpdateUserRoleWithAudit(
    actorId: string,
    targetUserId: string,
    newRole: Role,
    reason?: string,
  ) {
    const user = await this.findById(targetUserId);
    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'User not found',
      });
    }

    if (user.role === Role.ADMIN && newRole !== Role.ADMIN) {
      await this.ensureNotLastActiveAdmin(user);
    }

    const previousRole = user.role;
    user.role = newRole;
    const saved = await this.userRepo.save(user);

    await this.revokeAllUserSessions(targetUserId);

    await this.writeAuditLog({
      actorId,
      targetUserId,
      action: AdminAuditAction.CHANGE_ROLE,
      metadata: { previousRole, newRole },
      reason: reason ?? null,
    });

    return {
      id: saved.id,
      email: saved.email,
      displayName: saved.displayName,
      role: saved.role,
      status: saved.status,
      updatedAt: saved.updatedAt.toISOString(),
    };
  }

  async listAuditLogs(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [items, total] = await this.auditLogRepo.findAndCount({
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getInternalUserSummary(userId: string) {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'User not found',
      });
    }

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      status: user.status,
      avatarUrl: user.avatarUrl ?? null,
    };
  }

  async getInternalUserAccessStatus(userId: string) {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'User not found',
      });
    }

    return {
      userId: user.id,
      role: user.role,
      status: user.status,
      canAccess: user.status === UserStatus.ACTIVE,
    };
  }
}