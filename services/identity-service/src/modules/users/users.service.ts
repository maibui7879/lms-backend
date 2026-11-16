import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Repository } from 'typeorm';
import { UserEntity } from './entities/user.entity';

export enum Role {
  STUDENT = 'STUDENT',
  ADMIN = 'ADMIN',
  MODERATOR = 'MODERATOR',
}

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
      throw new Error('User not found');
    }
    user.status = AccountStatus.ACTIVE;
    user.emailVerifiedAt = new Date();
    return this.userRepo.save(user);
  }
}