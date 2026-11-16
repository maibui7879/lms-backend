import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Course } from '../courses/entities/course.entity';
import { CourseRevisionsController } from './course-revisions.controller';
import { CourseRevisionsService } from './course-revisions.service';
import { CourseReview } from './entities/course-review.entity';
import { CourseRevision } from './entities/course-revision.entity';
import { Chapter } from '../chapters/entities/chapter.entity';
import { Lesson } from '../lessons/entities/lesson.entity';
import { LearningItem } from '../learning-items/entities/learning-item.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Course,
      CourseReview,
      CourseRevision,
      Chapter,
      Lesson,
      LearningItem,
    ]),
  ],
  controllers: [CourseRevisionsController],
  providers: [CourseRevisionsService],
  exports: [CourseRevisionsService],
})
export class CourseRevisionsModule {}
