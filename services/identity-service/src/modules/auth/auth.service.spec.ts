import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as crypto from 'crypto';
import { MailService } from '../mail/mail.service';
import { UserEntity } from '../users/entities/user.entity';
import { UserStatus, UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { EmailOtpEntity } from './entities/email-otp.entity';
import { RefreshTokenEntity } from './entities/refresh-token.entity';

describe('AuthService - Refresh Rotation & Reuse Detection', () => {
  let service: AuthService;

  const mockUser: Partial<UserEntity> = {
    id: 'user-uuid-1',
    email: 'student@lms.edu.vn',
    displayName: 'Student One',
    role: 'STUDENT',
    status: UserStatus.ACTIVE,
    version: 1,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  let tokenRepoMock: {
    findOne: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    manager: { transaction: jest.Mock };
  };

  let userRepoMock: {
    findOne: jest.Mock;
  };

  beforeEach(async () => {
    userRepoMock = {
      findOne: jest.fn().mockResolvedValue(mockUser),
    };

    tokenRepoMock = {
      findOne: jest.fn(),
      save: jest.fn((entity: Partial<RefreshTokenEntity>) =>
        Promise.resolve({
          id: entity.id ?? 'new-token-uuid',
          ...entity,
        }),
      ),
      create: jest.fn((dto: Partial<RefreshTokenEntity>) => ({ ...dto })),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      manager: {
        transaction: jest.fn(
          async (cb: (manager: unknown) => Promise<unknown>) =>
            cb({
              getRepository: (entity: unknown) => {
                if (entity === RefreshTokenEntity) return tokenRepoMock;
                if (entity === UserEntity) return userRepoMock;
                return null;
              },
            }),
        ),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: {
            normalizeEmail: (e: string) => e.trim().toLowerCase(),
          },
        },
        {
          provide: MailService,
          useValue: { sendOtpEmail: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn((key: string) => {
              if (key === 'REFRESH_TOKEN_TTL_DAYS') return 7;
              if (key === 'ACCESS_TOKEN_TTL_SECONDS') return 900;
              return '';
            }),
            get: jest.fn((_key: string, defaultVal?: unknown) => defaultVal),
          },
        },
        {
          provide: getRepositoryToken(EmailOtpEntity),
          useValue: {},
        },
        {
          provide: getRepositoryToken(RefreshTokenEntity),
          useValue: tokenRepoMock,
        },
        {
          provide: JwtService,
          useValue: {
            signAsync: jest.fn().mockResolvedValue('signed-access-jwt'),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('rotates refresh token and revokes the previous token on valid refresh', async () => {
    const rawOldToken = 'raw-refresh-token-1';
    const oldTokenHash = crypto
      .createHash('sha256')
      .update(rawOldToken)
      .digest('hex');

    const storedToken: Partial<RefreshTokenEntity> = {
      id: 'token-id-1',
      userId: mockUser.id,
      tokenHash: oldTokenHash,
      familyId: 'family-uuid-1',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      replacedByTokenId: null,
    };

    tokenRepoMock.findOne.mockResolvedValueOnce(storedToken);

    const result = await service.refreshTokens(rawOldToken, {
      userAgent: 'JestTest',
      ipAddress: '127.0.0.1',
    });

    expect(result.accessToken).toBe('signed-access-jwt');
    expect(result.refreshToken).toBeDefined();
    expect(result.refreshToken).not.toBe(rawOldToken);
    expect(result.tokenType).toBe('Bearer');
    expect(result.expiresIn).toBe(900);

    // Token cũ phải được đánh dấu revokedAt và trỏ sang token mới
    expect(storedToken.revokedAt).toBeInstanceOf(Date);
    expect(storedToken.replacedByTokenId).toBe('new-token-uuid');
    expect(tokenRepoMock.save).toHaveBeenCalledTimes(2);
  });

  it('detects refresh token reuse and revokes the entire token family', async () => {
    const reusedRawToken = 'reused-raw-token';
    const revokedRecord: Partial<RefreshTokenEntity> = {
      id: 'token-id-1',
      userId: mockUser.id,
      familyId: 'compromised-family-id',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: new Date(Date.now() - 5_000),
    };

    tokenRepoMock.findOne.mockResolvedValueOnce(revokedRecord);

    await expect(service.refreshTokens(reusedRawToken)).rejects.toThrow(
      UnauthorizedException,
    );

    // Phải thu hồi toàn bộ token đang hoạt động thuộc familyId bị lộ
    expect(tokenRepoMock.update).toHaveBeenCalledWith(
      expect.objectContaining({ familyId: 'compromised-family-id' }),
      expect.objectContaining({ revokedAt: expect.any(Date) }),
    );
  });

  it('rejects expired refresh token and marks it revoked', async () => {
    const expiredToken: Partial<RefreshTokenEntity> = {
      id: 'token-expired',
      userId: mockUser.id,
      familyId: 'family-2',
      expiresAt: new Date(Date.now() - 10_000),
      revokedAt: null,
    };

    tokenRepoMock.findOne.mockResolvedValueOnce(expiredToken);

    await expect(service.refreshTokens('expired-raw')).rejects.toThrow(
      UnauthorizedException,
    );
    expect(expiredToken.revokedAt).toBeInstanceOf(Date);
    expect(tokenRepoMock.save).toHaveBeenCalledWith(expiredToken);
  });

  it('rejects refresh if user account is inactive', async () => {
    tokenRepoMock.findOne.mockResolvedValueOnce({
      id: 'token-active',
      userId: mockUser.id,
      familyId: 'family-3',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
    });
    userRepoMock.findOne.mockResolvedValueOnce({
      ...mockUser,
      status: UserStatus.INACTIVE,
    });

    await expect(service.refreshTokens('valid-raw')).rejects.toThrow(
      ForbiddenException,
    );
  });
});
