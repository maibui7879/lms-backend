import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Course } from '../courses/entities/course.entity';
import { CourseRevisionsController } from './course-revisions.controller';
import { CourseRevisionsService } from './course-revisions.service';
import { CourseReview } from './entities/course-review.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Course, CourseReview])],
  controllers: [CourseRevisionsController],
  providers: [CourseRevisionsService],
  exports: [CourseRevisionsService],
})
export class CourseRevisionsModule {}
