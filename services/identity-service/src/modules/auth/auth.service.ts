import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { IsNull, Repository } from 'typeorm';
import { MailService } from '../mail/mail.service';
import { UserEntity } from '../users/entities/user.entity';
import { AccountStatus, Role, UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResendOtpDto, VerifyEmailDto } from './dto/verify-email.dto';
import { EmailOtpEntity } from './entities/email-otp.entity';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
    @InjectRepository(EmailOtpEntity)
    private readonly otpRepo: Repository<EmailOtpEntity>,
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

  private async issueAndSendOtp(email: string, displayName: string): Promise<void> {
    const normalizedEmail = this.usersService.normalizeEmail(email);
    const ttlMinutes = Number(
      this.configService.get<number>('OTP_TTL_MINUTES', 10),
    );

    // Vô hiệu hóa các mã OTP cũ chưa dùng của email này
    await this.otpRepo.update(
      { email: normalizedEmail, usedAt: IsNull() },
      { usedAt: new Date() },
    );

    // Sinh mã OTP 6 chữ số ngẫu nhiên
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

    // Tạo user ở trạng thái INACTIVE cho đến khi nhập đúng OTP
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
      // Nhập sai quá 5 lần thì khóa luôn mã OTP này
      if (latestOtp.attempts >= 5) {
        latestOtp.usedAt = new Date();
      }
      await this.otpRepo.save(latestOtp);

      throw new BadRequestException({
        code: 'INVALID_OTP',
        message: 'Incorrect OTP code',
      });
    }

    // Đánh dấu OTP đã dùng và kích hoạt tài khoản
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

    if (user.status === AccountStatus.INACTIVE) {
      throw new ForbiddenException({
        code: 'ACCOUNT_INACTIVE',
        message: 'Your account is inactive or email is not verified',
      });
    }

    return user;
  }

  async login(dto: LoginDto) {
    const user = await this.validateCredentials(dto);
    return {
      user: this.toUserProfile(user),
    };
  }
}