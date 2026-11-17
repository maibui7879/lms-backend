import { Module } from '@nestjs/common';
import type { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { requestContext } from '../../common/request-context';
import { LearningDatabaseModule } from '../../database/learning-database.module';
import { CourseClient } from '../../integrations/course.client';
import { QuizClient } from '../../integrations/quiz.client';
import { MasteryModule } from '../mastery/mastery.module';
import { ProgressModule } from '../progress/progress.module';
import { RecommendationsController } from './recommendations.controller';
import { RecommendationsService } from './recommendations.service';
import { SkillPrerequisitesController } from './skill-prerequisites.controller';
import { SkillPrerequisitesRepository } from './repositories/skill-prerequisites.repository';

@Module({
  imports: [LearningDatabaseModule, MasteryModule, ProgressModule],
  controllers: [RecommendationsController, SkillPrerequisitesController],
  providers: [
    CourseClient,
    QuizClient,
    RecommendationsService,
    SkillPrerequisitesRepository,
  ],
})
export class RecommendationsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(requestContext)
      .forRoutes(RecommendationsController, SkillPrerequisitesController);
  }
}
