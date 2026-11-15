import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TerminusModule } from '@nestjs/terminus';
import { TypeOrmModule } from '@nestjs/typeorm';
import * as path from 'path';
import { validateEnv } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health/health.controller';
import { UserEntity } from './modules/users/entities/user.entity';
import { RefreshSessionEntity } from './modules/users/entities/refresh-session.entity';
import { UserAuditEntity } from './modules/users/entities/user-audit.entity';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: path.resolve(__dirname, '../.env'),
      validate: validateEnv,
    }),
    DatabaseModule,
    TypeOrmModule.forFeature([UserEntity, RefreshSessionEntity, UserAuditEntity]),
    TerminusModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}