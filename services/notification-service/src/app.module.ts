import { Module } from '@nestjs/common';
import type { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_FILTER } from '@nestjs/core';
import { databaseOptions, envFiles, validateEnvironment } from './config';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { requestContext } from './common/request-context';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: envFiles,
      validate: validateEnvironment,
    }),
    TypeOrmModule.forRootAsync({
      useFactory: () => databaseOptions(process.env),
    }),
    NotificationsModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_FILTER, useClass: HttpExceptionFilter }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(requestContext).forRoutes('*');
  }
}
