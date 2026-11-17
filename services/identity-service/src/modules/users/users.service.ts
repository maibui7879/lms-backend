import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Repository } from 'typeorm';
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

export { Role, UserEntity };

export enum AccountStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  PENDING = 'PENDING',
  BLOCKED = 'BLOCKED',
}

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
      status: input.status ?? AccountStatus.ACTIVE,
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
    user.status = AccountStatus.ACTIVE;
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
      }

      return request;
    });
  }
}