import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type {
  AuthUser,
  CreateLessonRequest,
  LessonData,
  ReorderRequest,
  UpdateLessonRequest,
  VersionRequest,
} from '@lms/contracts';
import { Repository } from 'typeorm';
import { Course } from '../courses/entities/course.entity';
import { Chapter } from '../chapters/entities/chapter.entity';
import { Lesson } from './entities/lesson.entity';

export function lessonData(lesson: Lesson): LessonData {
  return {
    id: lesson.id,
    courseId: lesson.courseId,
    revisionId: lesson.courseId,
    chapterId: lesson.chapterId,
    title: lesson.title,
    order: lesson.order,
    version: lesson.version,
  };
}

@Injectable()
export class LessonsService {
  constructor(
    @InjectRepository(Lesson) private readonly lessons: Repository<Lesson>,
    @InjectRepository(Chapter) private readonly chapters: Repository<Chapter>,
    @InjectRepository(Course) private readonly courses: Repository<Course>,
  ) {}

  async create(
    chapterId: string,
    dto: CreateLessonRequest,
    user: AuthUser,
  ): Promise<LessonData> {
    const { chapter, course } = await this.assertEditableChapter(
      chapterId,
      user,
    );
    const last = await this.lessons.findOne({
      where: { chapterId },
      order: { order: 'DESC' },
    });
    const lesson = this.lessons.create({
      courseId: chapter.courseId,
      chapterId,
      title: dto.title,
      order: (last?.order ?? 0) + 1,
      version: 1,
    });
    const saved = await this.lessons.save(lesson);
    await this.bumpCourse(course);
    return lessonData(saved);
  }

  async update(
    id: string,
    dto: UpdateLessonRequest,
    user: AuthUser,
  ): Promise<LessonData> {
    const lesson = await this.findLesson(id);
    const { course } = await this.assertEditableChapter(lesson.chapterId, user);
    this.assertVersion(lesson.version, dto.expectedVersion);
    const result = await this.lessons.update(
      { id, version: dto.expectedVersion },
      { title: dto.title, version: dto.expectedVersion + 1 },
    );
    if (!result.affected)
      throw this.versionConflict(dto.expectedVersion, dto.expectedVersion + 1);
    await this.bumpCourse(course);
    return lessonData(await this.lessons.findOneByOrFail({ id }));
  }

  async remove(id: string, dto: VersionRequest, user: AuthUser): Promise<void> {
    const lesson = await this.findLesson(id);
    const { course } = await this.assertEditableChapter(lesson.chapterId, user);
    this.assertVersion(lesson.version, dto.expectedVersion);
    const result = await this.lessons.delete({
      id,
      version: dto.expectedVersion,
    });
    if (!result.affected)
      throw this.versionConflict(dto.expectedVersion, dto.expectedVersion + 1);
    await this.lessons
      .createQueryBuilder()
      .update(Lesson)
      .set({ order: () => '"order" - 1' })
      .where('"chapterId" = :chapterId AND "order" > :order', {
        chapterId: lesson.chapterId,
        order: lesson.order,
      })
      .execute();
    await this.bumpCourse(course);
  }

  async reorder(
    chapterId: string,
    dto: ReorderRequest,
    user: AuthUser,
  ): Promise<LessonData[]> {
    const { chapter, course } = await this.assertEditableChapter(
      chapterId,
      user,
    );
    if (course.version !== dto.expectedVersion)
      throw this.versionConflict(dto.expectedVersion, course.version);
    const lessons = await this.lessons.find({
      where: { chapterId },
      order: { order: 'ASC' },
    });
    const actualIds = new Set(lessons.map((lesson) => lesson.id));
    if (
      dto.orderedIds.length !== lessons.length ||
      dto.orderedIds.some((id) => !actualIds.has(id))
    )
      throw new ConflictException({
        code: 'VALIDATION_ERROR',
        message: 'orderedIds must contain every lesson exactly once',
        details: {},
      });
    for (const [index, id] of dto.orderedIds.entries()) {
      const lesson = lessons.find((item) => item.id === id)!;
      await this.lessons.update(
        { id, chapterId },
        { order: index + 1, version: lesson.version + 1 },
      );
    }
    await this.bumpCourse(course);
    const ordered = await this.lessons.find({
      where: { chapterId },
      order: { order: 'ASC' },
    });
    return ordered.map(lessonData);
  }

  private async findLesson(id: string): Promise<Lesson> {
    const lesson = await this.lessons.findOneBy({ id });
    if (!lesson) throw new NotFoundException('Lesson not found');
    return lesson;
  }

  private async assertEditableChapter(
    chapterId: string,
    user: AuthUser,
  ): Promise<{
    chapter: Chapter;
    course: Course;
  }> {
    if (user.role !== 'INSTRUCTOR' || user.status !== 'ACTIVE')
      throw new ForbiddenException('Active instructor account required');
    const chapter = await this.chapters.findOneBy({ id: chapterId });
    if (!chapter) throw new NotFoundException('Chapter not found');
    const course = await this.courses.findOneBy({ id: chapter.courseId });
    if (!course) throw new NotFoundException('Course not found');
    if (course.instructorId !== user.id)
      throw new ForbiddenException('Course ownership required');
    if (course.status === 'PUBLISHED')
      throw new ConflictException({
        code: 'INVALID_COURSE_TRANSITION',
        message: 'Published course content must be updated through a revision',
        details: {},
      });
    return { chapter, course };
  }

  private assertVersion(currentVersion: number, expectedVersion: number): void {
    if (currentVersion !== expectedVersion)
      throw this.versionConflict(expectedVersion, currentVersion);
  }

  private async bumpCourse(course: Course): Promise<void> {
    const result = await this.courses.update(
      { id: course.id, version: course.version },
      {
        version: course.version + 1,
        contentVersion: course.contentVersion + 1,
      },
    );
    if (!result.affected)
      throw this.versionConflict(course.version, course.version + 1);
  }

  private versionConflict(expectedVersion: number, currentVersion: number) {
    return new ConflictException({
      code: 'VERSION_CONFLICT',
      message: 'Resource was changed by another request',
      details: { expectedVersion, currentVersion },
    });
  }
}
