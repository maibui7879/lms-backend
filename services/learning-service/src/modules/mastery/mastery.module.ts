import { Module } from '@nestjs/common';
import type { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { requestContext } from '../../common/request-context';
import { LearningDatabaseModule } from '../../database/learning-database.module';
import { CourseClient } from '../../integrations/course.client';
import { ProgressSyncModule } from '../progress-sync/progress-sync.module';
import { CourseSkillsController } from './course-skills.controller';
import { CourseSkillsService } from './course-skills.service';
import { InternalCourseSkillsController } from './internal-course-skills.controller';
import { MasteryCalculator } from './mastery-calculator';
import { MasteryController } from './mastery.controller';
import { MasteryService } from './mastery.service';
import { CourseSkillsRepository } from './repositories/course-skills.repository';
import { MasteryResultsRepository } from './repositories/mastery-results.repository';

@Module({
  imports: [LearningDatabaseModule, ProgressSyncModule],
  controllers: [
    CourseSkillsController,
    InternalCourseSkillsController,
    MasteryController,
  ],
  providers: [
    CourseClient,
    CourseSkillsService,
    CourseSkillsRepository,
    MasteryResultsRepository,
    MasteryService,
    MasteryCalculator,
  ],
  exports: [MasteryService, CourseSkillsService],
})
export class MasteryModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(requestContext)
      .forRoutes(
        CourseSkillsController,
        InternalCourseSkillsController,
        MasteryController,
      );
  }
}
