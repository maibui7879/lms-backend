import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Chapter } from '../chapters/entities/chapter.entity';
import { Course } from '../courses/entities/course.entity';
import { LearningItem } from '../learning-items/entities/learning-item.entity';
import { Lesson } from '../lessons/entities/lesson.entity';
import { CompletionPolicyController } from './completion-policy.controller';
import { CompletionPolicyService } from './completion-policy.service';
import { CompletionPolicy } from './entities/completion-policy.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CompletionPolicy,
      Course,
      Chapter,
      Lesson,
      LearningItem,
    ]),
  ],
  controllers: [CompletionPolicyController],
  providers: [CompletionPolicyService],
  exports: [CompletionPolicyService],
})
export class CompletionPolicyModule {}
