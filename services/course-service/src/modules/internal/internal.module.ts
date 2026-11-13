import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Chapter } from '../chapters/entities/chapter.entity';
import { CompletionPolicyModule } from '../completion-policy/completion-policy.module';
import { Course } from '../courses/entities/course.entity';
import { EnrollmentsModule } from '../enrollments/enrollments.module';
import { Enrollment } from '../enrollments/entities/enrollment.entity';
import { LearningItem } from '../learning-items/entities/learning-item.entity';
import { Lesson } from '../lessons/entities/lesson.entity';
import { InternalController } from './internal.controller';
import { InternalService } from './internal.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Course,
      Chapter,
      Lesson,
      LearningItem,
      Enrollment,
    ]),
    CompletionPolicyModule,
    EnrollmentsModule,
  ],
  controllers: [InternalController],
  providers: [InternalService],
  exports: [InternalService],
})
export class InternalModule {}
