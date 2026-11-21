import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtAuthGuard, RolesGuard } from '../../common/auth/guards';
import { MailService } from '../mail/mail.service';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmailOtpEntity } from './entities/email-otp.entity';
import { RefreshTokenEntity } from './entities/refresh-token.entity';

@Module({
  imports: [
    ConfigModule,
    UsersModule,
    TypeOrmModule.forFeature([EmailOtpEntity, RefreshTokenEntity]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const privateKey = configService
          .get<string>('JWT_PRIVATE_KEY')
          ?.replace(/\\n/g, '\n');
        const publicKey = configService
          .get<string>('JWT_PUBLIC_KEY')
          ?.replace(/\\n/g, '\n');

        return {
          privateKey,
          publicKey,
          signOptions: {
            algorithm: 'RS256',
            issuer: configService.getOrThrow<string>('JWT_ISSUER'),
            expiresIn: Number(
              configService.getOrThrow<number>('ACCESS_TOKEN_TTL_SECONDS'),
            ),
          },
          verifyOptions: {
            algorithms: ['RS256'],
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, MailService, JwtAuthGuard, RolesGuard],
  exports: [AuthService, JwtModule, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
