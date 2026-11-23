import { Module } from '@nestjs/common';
import type { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TerminusModule } from '@nestjs/terminus';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_FILTER } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { requestContext } from './common/middleware/request-context.middleware';
import { HealthController } from './health/health.controller';
import { QuizAttemptModule } from './modules/quiz-attempt/quiz-attempt.module';
import { QuizQuestionModule } from './modules/quiz-question/quiz-question.module';
import { QuizModule } from './modules/quiz/quiz.module';
import { QuizStatisticModule } from './modules/quiz-statistic/quiz-statistic.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TerminusModule,
    QuizModule,
    QuizQuestionModule,
    QuizAttemptModule,
    QuizStatisticModule,
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        return {
          type: 'postgres' as const,
          url: config.get<string>('DATABASE_URL'),
          autoLoadEntities: true,
          synchronize: false,
          migrationsRun: false,
        };
      },
    }),
  ],
  controllers: [AppController, HealthController],
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
