import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Chapter } from '../chapters/entities/chapter.entity';
import { Lesson } from '../lessons/entities/lesson.entity';
import { LearningItem } from '../learning-items/entities/learning-item.entity';
import { Enrollment } from '../enrollments/entities/enrollment.entity';
import { Course } from './entities/course.entity';
import {
  CoursesController,
  InstructorCoursesController,
} from './courses.controller';
import { CoursesService } from './courses.service';
import { CourseContentController } from './course-content.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Course,
      Chapter,
      Lesson,
      LearningItem,
      Enrollment,
    ]),
  ],
  controllers: [
    CoursesController,
    InstructorCoursesController,
    CourseContentController,
  ],
  providers: [CoursesService],
})
export class CoursesModule {}
