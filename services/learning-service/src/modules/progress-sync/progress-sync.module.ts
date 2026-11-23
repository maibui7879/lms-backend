import { Module } from '@nestjs/common';
import { LearningAuthModule } from '../../common/auth/learning-auth.module';
import type { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { requestContext } from '../../common/request-context';
import { LearningDatabaseModule } from '../../database/learning-database.module';
import { QuizClient } from '../../integrations/quiz.client';
import { AssessmentResultsConsumer } from './consumers/assessment-results.consumer';
import { ProgressSyncController } from './progress-sync.controller';
import { ProgressSyncService } from './progress-sync.service';
import { AssessmentAttemptsRepository } from './repositories/assessment-attempts.repository';

@Module({
  imports: [LearningDatabaseModule, LearningAuthModule],
  controllers: [ProgressSyncController],
  providers: [
    ProgressSyncService,
    QuizClient,
    AssessmentAttemptsRepository,
    AssessmentResultsConsumer,
  ],
  exports: [AssessmentAttemptsRepository],
})
export class ProgressSyncModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(requestContext).forRoutes(ProgressSyncController);
  }
}
