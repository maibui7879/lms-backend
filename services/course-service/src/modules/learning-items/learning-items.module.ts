import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Chapter } from '../chapters/entities/chapter.entity';
import { Course } from '../courses/entities/course.entity';
import { Lesson } from '../lessons/entities/lesson.entity';
import { LearningItemsController } from './learning-items.controller';
import { LearningItemsService } from './learning-items.service';
import { LearningItem } from './entities/learning-item.entity';

@Module({
  imports: [TypeOrmModule.forFeature([LearningItem, Lesson, Chapter, Course])],
  controllers: [LearningItemsController],
  providers: [LearningItemsService],
  exports: [LearningItemsService],
})
export class LearningItemsModule {}
