import { Module } from '@nestjs/common';
import type { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { requestContext } from '../../common/request-context';
import { LearningDatabaseModule } from '../../database/learning-database.module';
import { CourseClient } from '../../integrations/course.client';
import { ProgressSyncModule } from '../progress-sync/progress-sync.module';
import { DashboardController } from './dashboard/dashboard.controller';
import { QuizScoresController } from './quiz-scores/quiz-scores.controller';
import { QuizScoresService } from './quiz-scores/quiz-scores.service';
import { ProgressController } from './progress.controller';
import { ProgressService } from './progress.service';
import { ItemCompletionsRepository } from './repositories/item-completions.repository';
import { LearningResumeRepository } from './repositories/learning-resume.repository';
import { LessonCompletionsRepository } from './repositories/lesson-completions.repository';
import { CourseItemMigrationsRepository } from './repositories/course-item-migrations.repository';
import { CourseItemsMigrationController } from './migrations/course-items-migration.controller';
import { CourseItemsMigrationService } from './migrations/course-items-migration.service';

@Module({
  imports: [LearningDatabaseModule, ProgressSyncModule],
  controllers: [
    ProgressController,
    QuizScoresController,
    DashboardController,
    CourseItemsMigrationController,
  ],
  providers: [
    ProgressService,
    QuizScoresService,
    CourseClient,
    ItemCompletionsRepository,
    LearningResumeRepository,
    LessonCompletionsRepository,
    CourseItemMigrationsRepository,
    CourseItemsMigrationService,
  ],
})
export class ProgressModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(requestContext)
      .forRoutes(
        ProgressController,
        QuizScoresController,
        DashboardController,
        CourseItemsMigrationController,
      );
  }
}
