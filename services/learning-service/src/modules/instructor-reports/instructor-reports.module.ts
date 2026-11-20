import { Module } from '@nestjs/common';
import type { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { requestContext } from '../../common/request-context';
import { LearningDatabaseModule } from '../../database/learning-database.module';
import { CourseClient } from '../../integrations/course.client';
import { MasteryModule } from '../mastery/mastery.module';
import { ProgressModule } from '../progress/progress.module';
import { InstructorReportsController } from './instructor-reports.controller';
import { InstructorReportsService } from './instructor-reports.service';

@Module({
  imports: [LearningDatabaseModule, ProgressModule, MasteryModule],
  controllers: [InstructorReportsController],
  providers: [CourseClient, InstructorReportsService],
})
export class InstructorReportsModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(requestContext).forRoutes(InstructorReportsController);
  }
}
