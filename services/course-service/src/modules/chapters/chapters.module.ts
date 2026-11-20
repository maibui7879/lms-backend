import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Course } from '../courses/entities/course.entity';
import { CourseRevision } from '../course-revisions/entities/course-revision.entity';
import { ChaptersController } from './chapters.controller';
import { ChaptersService } from './chapters.service';
import { Chapter } from './entities/chapter.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Chapter, Course, CourseRevision])],
  controllers: [ChaptersController],
  providers: [ChaptersService],
  exports: [ChaptersService],
})
export class ChaptersModule {}
