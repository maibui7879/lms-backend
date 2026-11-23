import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TerminusModule } from '@nestjs/terminus';
import { TypeOrmModule } from '@nestjs/typeorm';
import * as path from 'path';
import { validateEnv } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health/health.controller';
import { UserEntity } from './modules/users/entities/user.entity';
import { UserAuditEntity } from './modules/users/entities/user-audit.entity';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['services/identity-service/.env', '.env'],
      validate: validateEnv,
    }),
    DatabaseModule,
    TypeOrmModule.forFeature([UserEntity, UserAuditEntity]),
    TerminusModule,
    UsersModule,
    AuthModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
