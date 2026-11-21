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
import { EntityManager, IsNull, Repository } from 'typeorm';
import { JwtAccessPayload } from '../../common/auth/jwt-payload.interface';
import { MailService } from '../mail/mail.service';
import { UserEntity } from '../users/entities/user.entity';
import {
  UserStatus as AccountStatus,
  Role,
  UsersService,
} from '../users/users.service';
import { ForgotPasswordDto, ResetPasswordDto } from './dto/forgot-password.dto';
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

  private toAuthUser(user: UserEntity) {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
    };
  }

  private toUserProfile(user: UserEntity) {
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

  private hashOtp(otp: string): string {
    return crypto.createHash('sha256').update(otp).digest('hex');
  }

  private hashToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  private async issueTokenPair(
    user: UserEntity,
    meta?: { userAgent?: string; ipAddress?: string; familyId?: string },
    manager?: EntityManager,
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
      this.configService.getOrThrow<number>('REFRESH_TOKEN_TTL_DAYS'),
    );
    const expiresAt = new Date(
      Date.now() + refreshTtlDays * 24 * 60 * 60 * 1000,
    );

    const tokenRepo = manager
      ? manager.getRepository(RefreshTokenEntity)
      : this.refreshTokenRepo;

    const savedRefresh = await tokenRepo.save(
      tokenRepo.create({
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
      refreshExpiresAt: savedRefresh.expiresAt.toISOString(),
    };
  }

  private async issueAndSendOtp(
    email: string,
    displayName: string,
  ): Promise<void> {
    const normalizedEmail = this.usersService.normalizeEmail(email);
    const ttlMinutes = Number(
      this.configService.get<number>('OTP_TTL_MINUTES', 10),
    );

    await this.otpRepo.update(
      { email: normalizedEmail, purpose: 'VERIFY_EMAIL', usedAt: IsNull() },
      { usedAt: new Date() },
    );

    const otpCode = crypto.randomInt(100000, 1000000).toString();
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

    const otpEntity = this.otpRepo.create({
      email: normalizedEmail,
      purpose: 'VERIFY_EMAIL',
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

    const displayName =
      dto.displayName?.trim() || dto.email.split('@')[0].trim();

    const user = await this.usersService.createUser({
      email: dto.email,
      passwordHash,
      displayName,
      role: Role.STUDENT,
      status: AccountStatus.INACTIVE,
    });

    await this.issueAndSendOtp(user.email, user.displayName);

    return this.toUserProfile(user);
  }

  async verifyEmail(dto: VerifyEmailDto) {
    const normalizedEmail = this.usersService.normalizeEmail(dto.email);
    const user = await this.usersService.findByEmail(normalizedEmail);
    if (!user) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Account not found',
      });
    }

    if (user.emailVerifiedAt && user.status === AccountStatus.ACTIVE) {
      return this.toUserProfile(user);
    }

    const latestOtp = await this.otpRepo.findOne({
      where: {
        email: normalizedEmail,
        purpose: 'VERIFY_EMAIL',
        usedAt: IsNull(),
      },
      order: { createdAt: 'DESC' },
    });

    if (!latestOtp || latestOtp.expiresAt < new Date()) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
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
        code: 'VALIDATION_ERROR',
        message: 'Incorrect OTP code',
      });
    }

    latestOtp.usedAt = new Date();
    await this.otpRepo.save(latestOtp);

    const activatedUser = await this.usersService.activateUser(user.id);
    return this.toUserProfile(activatedUser);
  }

  async resendOtp(dto: ResendOtpDto) {
    const normalizedEmail = this.usersService.normalizeEmail(dto.email);
    const user = await this.usersService.findByEmail(normalizedEmail);
    if (!user) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Account not found',
      });
    }

    if (user.emailVerifiedAt && user.status === AccountStatus.ACTIVE) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Email is already verified',
      });
    }

    await this.issueAndSendOtp(user.email, user.displayName);

    return {
      message: 'A new OTP has been sent to your email',
    };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const normalizedEmail = this.usersService.normalizeEmail(dto.email);
    const user = await this.usersService.findByEmail(normalizedEmail);

    if (!user) {
      return {
        message: 'If the email exists, a password reset code has been sent',
      };
    }

    const ttlMinutes = Number(
      this.configService.get<number>('OTP_TTL_MINUTES', 10),
    );

    await this.otpRepo.update(
      { email: normalizedEmail, purpose: 'RESET_PASSWORD', usedAt: IsNull() },
      { usedAt: new Date() },
    );

    const otpCode = crypto.randomInt(100000, 1000000).toString();
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

    await this.otpRepo.save(
      this.otpRepo.create({
        email: normalizedEmail,
        purpose: 'RESET_PASSWORD',
        otpHash: this.hashOtp(otpCode),
        expiresAt,
        usedAt: null,
        attempts: 0,
      }),
    );

    await this.mailService.sendPasswordResetEmail(
      normalizedEmail,
      user.displayName,
      otpCode,
      ttlMinutes,
    );

    return {
      message: 'If the email exists, a password reset code has been sent',
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const normalizedEmail = this.usersService.normalizeEmail(dto.email);
    const user = await this.usersService.findByEmail(normalizedEmail);
    if (!user) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Reset code is invalid or has expired',
      });
    }

    const latestOtp = await this.otpRepo.findOne({
      where: {
        email: normalizedEmail,
        purpose: 'RESET_PASSWORD',
        usedAt: IsNull(),
      },
      order: { createdAt: 'DESC' },
    });

    if (!latestOtp || latestOtp.expiresAt < new Date()) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Reset code is invalid or has expired',
      });
    }

    if (latestOtp.otpHash !== this.hashOtp(dto.otp)) {
      latestOtp.attempts += 1;
      if (latestOtp.attempts >= 5) {
        latestOtp.usedAt = new Date();
      }
      await this.otpRepo.save(latestOtp);
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Incorrect reset code',
      });
    }

    latestOtp.usedAt = new Date();
    await this.otpRepo.save(latestOtp);

    const newPasswordHash = await argon2.hash(dto.newPassword, {
      type: argon2.argon2id,
    });
    await this.usersService.resetUserPassword(user.id, newPasswordHash);

    return {
      message: 'Password has been reset successfully',
    };
  }

  async validateCredentials(dto: LoginDto): Promise<UserEntity> {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Invalid email or password',
      });
    }

    const isPasswordValid = await argon2.verify(user.passwordHash, dto.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
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
      this.configService.getOrThrow<number>('ACCESS_TOKEN_TTL_SECONDS'),
    );

    return {
      accessToken: pair.accessToken,
      refreshToken: pair.refreshToken,
      tokenType: 'Bearer' as const,
      expiresIn,
      refreshExpiresAt: pair.refreshExpiresAt,
      user: this.toAuthUser(user),
    };
  }

  getGoogleOAuthUrl(): string {
    const clientId = this.configService.getOrThrow<string>('GOOGLE_CLIENT_ID');
    const redirectUri = this.configService.getOrThrow<string>(
      'GOOGLE_CALLBACK_URL',
    );
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline',
      prompt: 'select_account',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async handleGoogleCallback(
    code: string,
    meta?: { userAgent?: string; ipAddress?: string },
  ) {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.configService.getOrThrow<string>('GOOGLE_CLIENT_ID'),
        client_secret: this.configService.getOrThrow<string>(
          'GOOGLE_CLIENT_SECRET',
        ),
        redirect_uri: this.configService.getOrThrow<string>(
          'GOOGLE_CALLBACK_URL',
        ),
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Failed to exchange Google authorization code',
      });
    }

    const tokenData = (await tokenRes.json()) as { access_token?: string };
    const profileRes = await fetch(
      'https://www.googleapis.com/oauth2/v3/userinfo',
      { headers: { Authorization: `Bearer ${tokenData.access_token}` } },
    );
    const profile = (await profileRes.json()) as {
      sub?: string;
      email?: string;
      name?: string;
      picture?: string;
    };

    if (!profile.sub || !profile.email) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Google account did not provide a verified email',
      });
    }

    const user = await this.usersService.findOrCreateOAuthUser({
      provider: 'GOOGLE',
      providerId: profile.sub,
      email: profile.email,
      displayName: profile.name || profile.email.split('@')[0],
      avatarUrl: profile.picture ?? null,
    });

    if (user.status !== AccountStatus.ACTIVE) {
      throw new ForbiddenException({
        code: 'ACCOUNT_INACTIVE',
        message: 'Your account is inactive',
      });
    }

    const pair = await this.issueTokenPair(user, meta);
    const expiresIn = Number(
      this.configService.getOrThrow<number>('ACCESS_TOKEN_TTL_SECONDS'),
    );

    return {
      accessToken: pair.accessToken,
      refreshToken: pair.refreshToken,
      tokenType: 'Bearer' as const,
      expiresIn,
      refreshExpiresAt: pair.refreshExpiresAt,
      user: this.toAuthUser(user),
    };
  }

  getGithubOAuthUrl(): string {
    const clientId = this.configService.getOrThrow<string>('GITHUB_CLIENT_ID');
    const redirectUri = this.configService.getOrThrow<string>(
      'GITHUB_CALLBACK_URL',
    );
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: 'read:user user:email',
    });
    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  async handleGithubCallback(
    code: string,
    meta?: { userAgent?: string; ipAddress?: string },
  ) {
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: this.configService.getOrThrow<string>('GITHUB_CLIENT_ID'),
        client_secret: this.configService.getOrThrow<string>(
          'GITHUB_CLIENT_SECRET',
        ),
        code,
        redirect_uri: this.configService.getOrThrow<string>(
          'GITHUB_CALLBACK_URL',
        ),
      }),
    });

    const tokenData = (await tokenRes.json()) as { access_token?: string };
    if (!tokenData.access_token) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Failed to exchange GitHub authorization code',
      });
    }

    const ghHeaders = {
      Authorization: `Bearer ${tokenData.access_token}`,
      Accept: 'application/vnd.github+json',
    };

    const userRes = await fetch('https://api.github.com/user', {
      headers: ghHeaders,
    });
    const ghUser = (await userRes.json()) as {
      id?: number;
      login?: string;
      name?: string;
      email?: string | null;
      avatar_url?: string;
    };

    let email = ghUser.email ?? null;
    if (!email) {
      const emailsRes = await fetch('https://api.github.com/user/emails', {
        headers: ghHeaders,
      });
      const emails = (await emailsRes.json()) as Array<{
        email: string;
        primary: boolean;
        verified: boolean;
      }>;
      const primary =
        emails.find((e) => e.primary && e.verified) ??
        emails.find((e) => e.verified);
      email = primary?.email ?? null;
    }

    if (!ghUser.id || !email) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'GitHub account did not provide a verified email',
      });
    }

    const user = await this.usersService.findOrCreateOAuthUser({
      provider: 'GITHUB',
      providerId: String(ghUser.id),
      email,
      displayName: ghUser.name || ghUser.login || email.split('@')[0],
      avatarUrl: ghUser.avatar_url ?? null,
    });

    if (user.status !== AccountStatus.ACTIVE) {
      throw new ForbiddenException({
        code: 'ACCOUNT_INACTIVE',
        message: 'Your account is inactive',
      });
    }

    const pair = await this.issueTokenPair(user, meta);
    const expiresIn = Number(
      this.configService.getOrThrow<number>('ACCESS_TOKEN_TTL_SECONDS'),
    );

    return {
      accessToken: pair.accessToken,
      refreshToken: pair.refreshToken,
      tokenType: 'Bearer' as const,
      expiresIn,
      refreshExpiresAt: pair.refreshExpiresAt,
      user: this.toAuthUser(user),
    };
  }

  async refreshTokens(
    rawRefreshToken: string,
    meta?: { userAgent?: string; ipAddress?: string },
  ) {
    const tokenHash = this.hashToken(rawRefreshToken);

    return this.refreshTokenRepo.manager.transaction(async (manager) => {
      const tokenRepo = manager.getRepository(RefreshTokenEntity);
      const userRepo = manager.getRepository(UserEntity);

      const existing = await tokenRepo.findOne({
        where: { tokenHash },
        lock: { mode: 'pessimistic_write' },
      });

      if (!existing) {
        throw new UnauthorizedException({
          code: 'INVALID_REFRESH_TOKEN',
          message: 'Refresh token is invalid',
        });
      }

      if (existing.revokedAt) {
        await tokenRepo.update(
          { familyId: existing.familyId, revokedAt: IsNull() },
          { revokedAt: new Date() },
        );
        throw new UnauthorizedException({
          code: 'INVALID_REFRESH_TOKEN',
          message: 'Refresh token reuse detected. Please log in again.',
        });
      }

      if (existing.expiresAt.getTime() <= Date.now()) {
        existing.revokedAt = new Date();
        await tokenRepo.save(existing);
        throw new UnauthorizedException({
          code: 'INVALID_REFRESH_TOKEN',
          message: 'Refresh token has expired',
        });
      }

      const user = await userRepo.findOne({ where: { id: existing.userId } });
      if (!user || user.status !== AccountStatus.ACTIVE) {
        throw new ForbiddenException({
          code: 'ACCOUNT_INACTIVE',
          message: 'User account is not active',
        });
      }

      const pair = await this.issueTokenPair(
        user,
        {
          userAgent: meta?.userAgent,
          ipAddress: meta?.ipAddress,
          familyId: existing.familyId,
        },
        manager,
      );

      existing.revokedAt = new Date();
      existing.replacedByTokenId = pair.refreshTokenId;
      await tokenRepo.save(existing);

      const expiresIn = Number(
        this.configService.getOrThrow<number>('ACCESS_TOKEN_TTL_SECONDS'),
      );

      return {
        accessToken: pair.accessToken,
        refreshToken: pair.refreshToken,
        tokenType: 'Bearer' as const,
        expiresIn,
        refreshExpiresAt: pair.refreshExpiresAt,
        user: this.toAuthUser(user),
      };
    });
  }

  async logout(rawRefreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(rawRefreshToken);
    const existing = await this.refreshTokenRepo.findOne({
      where: { tokenHash },
    });

    if (existing && !existing.revokedAt) {
      existing.revokedAt = new Date();
      await this.refreshTokenRepo.save(existing);
    }
  }

  async logoutAll(userId: string): Promise<void> {
    await this.refreshTokenRepo.update(
      { userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }
}