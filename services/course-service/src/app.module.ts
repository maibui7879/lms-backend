import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_FILTER } from '@nestjs/core';
import type { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { requestContext } from './common/request-context';
import { CoursesModule } from './modules/courses/courses.module';
import { databaseOptions, envFiles, validateEnvironment } from './config';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { CourseRevisionsModule } from './modules/course-revisions/course-revisions.module';
import { ChaptersModule } from './modules/chapters/chapters.module';
import { LessonsModule } from './modules/lessons/lessons.module';
import { LearningItemsModule } from './modules/learning-items/learning-items.module';
import { EnrollmentsModule } from './modules/enrollments/enrollments.module';
import { CompletionPolicyModule } from './modules/completion-policy/completion-policy.module';
import { DiscussionsModule } from './modules/discussions/discussions.module';
import { InternalModule } from './modules/internal/internal.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: envFiles,
      validate: validateEnvironment,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        databaseOptions({
          NODE_ENV: config.get('NODE_ENV'),
          DATABASE_URL: config.get('DATABASE_URL'),
          DB_SYNC: config.get('DB_SYNC'),
          MOCK_AUTH: config.get('MOCK_AUTH'),
          PORT: config.get('PORT'),
        }),
    }),
    CoursesModule,
    CourseRevisionsModule,
    ChaptersModule,
    LessonsModule,
    LearningItemsModule,
    EnrollmentsModule,
    CompletionPolicyModule,
    DiscussionsModule,
    InternalModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(requestContext).forRoutes('*');
  }
}
