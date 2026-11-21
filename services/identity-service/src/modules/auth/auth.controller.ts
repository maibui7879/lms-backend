import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { CurrentUser, Public } from '../../common/auth/auth.decorators';
import { JwtAuthGuard } from '../../common/auth/guards';
import type { JwtAccessPayload } from '../../common/auth/jwt-payload.interface';
import { AuthService } from './auth.service';
import { ForgotPasswordDto, ResetPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { ResendOtpDto, VerifyEmailDto } from './dto/verify-email.dto';
import { RateLimit, RateLimitGuard } from '../../common/auth/rate-limit.guard';

@ApiTags('Auth')
@UseGuards(RateLimitGuard)
@Controller('api/v1/auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Post('register')
  @RateLimit({ limit: 5, windowSeconds: 60 })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new student account' })
  @ApiResponse({ status: 201, description: 'User registered successfully' })
  @ApiResponse({ status: 409, description: 'Email already exists' })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @RateLimit({ limit: 5, windowSeconds: 60 })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email and password' })
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto, {
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    });
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate refresh token and issue new access token' })
  refresh(@Body() dto: RefreshTokenDto, @Req() req: Request) {
    return this.authService.refreshTokens(dto.refreshToken, {
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    });
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify registration email with 6-digit OTP' })
  @ApiResponse({
    status: 200,
    description: 'Email verified and account activated',
  })
  @ApiResponse({ status: 400, description: 'Invalid or expired OTP' })
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto);
  }

  @Post('resend-otp')
  @RateLimit({ limit: 3, windowSeconds: 60, keyByEmail: true })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend 6-digit verification OTP' })
  @ApiResponse({ status: 200, description: 'New OTP sent to email' })
  async resendOtp(@Body() dto: ResendOtpDto) {
    return this.authService.resendOtp(dto);
  }

  @Get('public-key')
  @ApiOperation({
    summary: 'Get RS256 public key for token verification across microservices',
  })
  getPublicKey() {
    const publicKey = this.configService
      .get<string>('JWT_PUBLIC_KEY')
      ?.replace(/\\n/g, '\n');
    return {
      algorithm: 'RS256',
      publicKey,
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body() dto: RefreshTokenDto): Promise<void> {
    await this.authService.logout(dto.refreshToken);
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke all active refresh tokens of current user' })
  async logoutAll(@CurrentUser() user: JwtAccessPayload) {
    return this.authService.logoutAll(user.sub);
  }

  @Public()
  @Post('forgot-password')
  @RateLimit({ limit: 3, windowSeconds: 60, keyByEmail: true })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request password reset OTP via email' })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reset password using OTP and revoke active sessions',
  })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Public()
  @Get('google')
  @ApiOperation({ summary: 'Redirect to Google OAuth2 consent screen' })
  googleLogin(@Res() res: Response) {
    return res.redirect(this.authService.getGoogleOAuthUrl());
  }

  @Public()
  @Get('google/callback')
  @ApiOperation({ summary: 'Handle Google OAuth2 callback and issue tokens' })
  googleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Req() req: Request,
  ) {
    if (!code) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Missing authorization code',
      });
    }
    return this.authService.handleGoogleCallback(code, state, {
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    });
  }

  @Public()
  @Get('github')
  @ApiOperation({ summary: 'Redirect to GitHub OAuth2 authorization screen' })
  githubLogin(@Res() res: Response) {
    return res.redirect(this.authService.getGithubOAuthUrl());
  }

  @Public()
  @Get('github/callback')
  @ApiOperation({ summary: 'Handle GitHub OAuth2 callback and issue tokens' })
  githubCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Req() req: Request,
  ) {
    if (!code) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Missing authorization code',
      });
    }
    return this.authService.handleGithubCallback(code, state, {
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    });
  }
}
