import { Module } from '@nestjs/common';
import type { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { requestContext } from '../../common/request-context';
import { LearningDatabaseModule } from '../../database/learning-database.module';
import { CourseClient } from '../../integrations/course.client';
import { ProgressSyncModule } from '../progress-sync/progress-sync.module';
import { ProgressController } from './progress.controller';
import { ProgressService } from './progress.service';
import { ItemCompletionsRepository } from './repositories/item-completions.repository';

@Module({
  imports: [LearningDatabaseModule, ProgressSyncModule],
  controllers: [ProgressController],
  providers: [ProgressService, CourseClient, ItemCompletionsRepository],
})
export class ProgressModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(requestContext).forRoutes(ProgressController);
  }
}
