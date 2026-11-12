import { Module } from '@nestjs/common';
import { CourseRevisionsController } from './course-revisions.controller';
import { CourseRevisionsService } from './course-revisions.service';

@Module({
  controllers: [CourseRevisionsController],
  providers: [CourseRevisionsService],
  exports: [CourseRevisionsService],
})
export class CourseRevisionsModule {}
