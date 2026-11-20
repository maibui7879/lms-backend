import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { IsNull, Repository } from 'typeorm';
import { JwtAccessPayload } from '../../common/auth/jwt-payload.interface';
import { MailService } from '../mail/mail.service';
import { UserEntity } from '../users/entities/user.entity';
import { Role, UsersService, UserStatus as AccountStatus } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResendOtpDto, VerifyEmailDto } from './dto/verify-email.dto';
import { EmailOtpEntity } from './entities/email-otp.entity';
import { RefreshTokenEntity } from './entities/refresh-token.entity';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
    @InjectRepository(EmailOtpEntity)
    private readonly otpRepo: Repository<EmailOtpEntity>,
    @InjectRepository(RefreshTokenEntity)
    private readonly refreshTokenRepo: Repository<RefreshTokenEntity>,
    private readonly jwtService: JwtService,
  ) {}

  private toUserProfile(user: UserEntity) {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      status: user.status,
      avatarUrl: user.avatarUrl ?? null,
      bio: user.bio ?? null,
      emailVerifiedAt: user.emailVerifiedAt
        ? user.emailVerifiedAt.toISOString()
        : null,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }

  private hashOtp(otp: string): string {
    return crypto.createHash('sha256').update(otp).digest('hex');
  }

  private hashToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  private async issueTokenPair(
    user: UserEntity,
    meta?: { userAgent?: string; ipAddress?: string; familyId?: string },
  ) {
    const payload: JwtAccessPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    const rawRefreshToken = crypto.randomBytes(48).toString('hex');
    const tokenHash = this.hashToken(rawRefreshToken);
    const refreshTtlDays = Number(
      this.configService.get<number>('JWT_REFRESH_TTL_DAYS', 7),
    );
    const expiresAt = new Date(
      Date.now() + refreshTtlDays * 24 * 60 * 60 * 1000,
    );

    const savedRefresh = await this.refreshTokenRepo.save(
      this.refreshTokenRepo.create({
        userId: user.id,
        tokenHash,
        familyId: meta?.familyId ?? crypto.randomUUID(),
        userAgent: meta?.userAgent?.slice(0, 255) ?? null,
        ipAddress: meta?.ipAddress ?? null,
        expiresAt,
      }),
    );

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      refreshTokenId: savedRefresh.id,
    };
  }

  private async issueAndSendOtp(email: string, displayName: string): Promise<void> {
    const normalizedEmail = this.usersService.normalizeEmail(email);
    const ttlMinutes = Number(
      this.configService.get<number>('OTP_TTL_MINUTES', 10),
    );

    await this.otpRepo.update(
      { email: normalizedEmail, usedAt: IsNull() },
      { usedAt: new Date() },
    );

    const otpCode = crypto.randomInt(100000, 1000000).toString();
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

    const otpEntity = this.otpRepo.create({
      email: normalizedEmail,
      otpHash: this.hashOtp(otpCode),
      expiresAt,
      usedAt: null,
      attempts: 0,
    });
    await this.otpRepo.save(otpEntity);

    await this.mailService.sendOtpEmail(
      normalizedEmail,
      displayName,
      otpCode,
      ttlMinutes,
    );
  }

  async register(dto: RegisterDto) {
    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
    });

    const user = await this.usersService.createUser({
      email: dto.email,
      passwordHash,
      displayName: dto.displayName.trim(),
      role: Role.STUDENT,
      status: AccountStatus.INACTIVE,
    });

    await this.issueAndSendOtp(user.email, user.displayName);

    return {
      message: 'Registration successful. Please verify your email with the OTP sent.',
      user: this.toUserProfile(user),
    };
  }

  async verifyEmail(dto: VerifyEmailDto) {
    const normalizedEmail = this.usersService.normalizeEmail(dto.email);
    const user = await this.usersService.findByEmail(normalizedEmail);
    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'Account not found',
      });
    }

    if (user.emailVerifiedAt && user.status === AccountStatus.ACTIVE) {
      return {
        message: 'Email is already verified',
        user: this.toUserProfile(user),
      };
    }

    const latestOtp = await this.otpRepo.findOne({
      where: { email: normalizedEmail, usedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });

    if (!latestOtp || latestOtp.expiresAt < new Date()) {
      throw new BadRequestException({
        code: 'INVALID_OR_EXPIRED_OTP',
        message: 'OTP is invalid or has expired',
      });
    }

    if (latestOtp.otpHash !== this.hashOtp(dto.otp)) {
      latestOtp.attempts += 1;
      if (latestOtp.attempts >= 5) {
        latestOtp.usedAt = new Date();
      }
      await this.otpRepo.save(latestOtp);

      throw new BadRequestException({
        code: 'INVALID_OTP',
        message: 'Incorrect OTP code',
      });
    }

    latestOtp.usedAt = new Date();
    await this.otpRepo.save(latestOtp);

    await this.usersService.activateUser(user.id);
    const activatedUser = await this.usersService.findById(user.id);

    if (!activatedUser) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'Account not found after activation',
      });
    }

    return {
      message: 'Email verified successfully',
      user: this.toUserProfile(activatedUser),
    };
  }

  async resendOtp(dto: ResendOtpDto) {
    const normalizedEmail = this.usersService.normalizeEmail(dto.email);
    const user = await this.usersService.findByEmail(normalizedEmail);
    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'Account not found',
      });
    }

    if (user.emailVerifiedAt && user.status === AccountStatus.ACTIVE) {
      throw new BadRequestException({
        code: 'EMAIL_ALREADY_VERIFIED',
        message: 'Email is already verified',
      });
    }

    await this.issueAndSendOtp(user.email, user.displayName);

    return {
      message: 'A new OTP has been sent to your email',
    };
  }

  async validateCredentials(dto: LoginDto): Promise<UserEntity> {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
    }

    const isPasswordValid = await argon2.verify(user.passwordHash, dto.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
    }

    if (user.status !== AccountStatus.ACTIVE) {
      throw new ForbiddenException({
        code: 'ACCOUNT_INACTIVE',
        message: 'Your account is inactive or email is not verified',
      });
    }

    return user;
  }

  async login(
    dto: LoginDto,
    meta?: { userAgent?: string; ipAddress?: string },
  ) {
    const user = await this.validateCredentials(dto);
    const pair = await this.issueTokenPair(user, meta);
    const expiresIn = Number(
      this.configService.get<number>('ACCESS_TOKEN_TTL_SECONDS', 900),
    );

    return {
      accessToken: pair.accessToken,
      refreshToken: pair.refreshToken,
      tokenType: 'Bearer',
      expiresIn,
      user: this.toUserProfile(user),
    };
  }

  async refreshTokens(
    rawRefreshToken: string,
    meta?: { userAgent?: string; ipAddress?: string },
  ) {
    const tokenHash = this.hashToken(rawRefreshToken);
    const existing = await this.refreshTokenRepo.findOne({
      where: { tokenHash },
    });

    if (!existing) {
      throw new UnauthorizedException({
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Refresh token is invalid',
      });
    }

    if (existing.revokedAt) {
      await this.refreshTokenRepo.update(
        { familyId: existing.familyId, revokedAt: IsNull() },
        { revokedAt: new Date() },
      );
      throw new UnauthorizedException({
        code: 'REFRESH_TOKEN_REUSED',
        message: 'Refresh token reuse detected. Please log in again.',
      });
    }

    if (existing.expiresAt.getTime() <= Date.now()) {
      existing.revokedAt = new Date();
      await this.refreshTokenRepo.save(existing);
      throw new UnauthorizedException({
        code: 'REFRESH_TOKEN_EXPIRED',
        message: 'Refresh token has expired',
      });
    }

    const user = await this.usersService.findById(existing.userId);
    if (!user || user.status !== AccountStatus.ACTIVE) {
      throw new UnauthorizedException({
        code: 'ACCOUNT_INACTIVE',
        message: 'User account is not active',
      });
    }

    const pair = await this.issueTokenPair(user, {
      userAgent: meta?.userAgent,
      ipAddress: meta?.ipAddress,
      familyId: existing.familyId,
    });

    existing.revokedAt = new Date();
    existing.replacedByTokenId = pair.refreshTokenId;
    await this.refreshTokenRepo.save(existing);

    const expiresIn = Number(
      this.configService.get<number>('ACCESS_TOKEN_TTL_SECONDS', 900),
    );

    return {
      accessToken: pair.accessToken,
      refreshToken: pair.refreshToken,
      tokenType: 'Bearer',
      expiresIn,
      user: this.toUserProfile(user),
    };
  }

  async logout(rawRefreshToken: string) {
    const tokenHash = this.hashToken(rawRefreshToken);
    const existing = await this.refreshTokenRepo.findOne({
      where: { tokenHash },
    });

    if (existing && !existing.revokedAt) {
      existing.revokedAt = new Date();
      await this.refreshTokenRepo.save(existing);
    }

    return { message: 'Logged out successfully' };
  }

  async logoutAll(userId: string) {
    await this.refreshTokenRepo.update(
      { userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
    return { message: 'Logged out from all devices successfully' };
  }
}