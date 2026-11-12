import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type {
  AuthUser,
  CourseOutlineData,
  CreateLearningItemRequest,
  LearningItemData,
  ReorderRequest,
  UpdateLearningItemRequest,
  VersionRequest,
} from '@lms/contracts';
import { Repository } from 'typeorm';
import { Course } from '../courses/entities/course.entity';
import { Chapter } from '../chapters/entities/chapter.entity';
import { Lesson } from '../lessons/entities/lesson.entity';
import { LearningItem } from './entities/learning-item.entity';

export function learningItemData(item: LearningItem): LearningItemData {
  const base = {
    id: item.id,
    courseId: item.courseId,
    lessonId: item.lessonId,
    title: item.title,
    required: item.required,
    order: item.order,
    contentVersion: item.contentVersion,
    version: item.version,
  };
  if (item.type === 'VIDEO')
    return {
      ...base,
      type: 'VIDEO',
      videoUrl: item.videoUrl!,
      durationSeconds: item.durationSeconds!,
    };
  if (item.type === 'READING')
    return { ...base, type: 'READING', body: item.body! };
  return {
    ...base,
    type: 'QUIZ',
    quizId: item.quizId!,
    assessmentVersion: item.assessmentVersion!,
  };
}

@Injectable()
export class LearningItemsService {
  constructor(
    @InjectRepository(LearningItem)
    private readonly items: Repository<LearningItem>,
    @InjectRepository(Lesson) private readonly lessons: Repository<Lesson>,
    @InjectRepository(Chapter) private readonly chapters: Repository<Chapter>,
    @InjectRepository(Course) private readonly courses: Repository<Course>,
  ) {}

  async create(
    lessonId: string,
    dto: CreateLearningItemRequest,
    user: AuthUser,
  ): Promise<LearningItemData> {
    const { lesson, course } = await this.assertEditableLesson(lessonId, user);
    const last = await this.items.findOne({
      where: { lessonId },
      order: { order: 'DESC' },
    });
    const item = this.items.create({
      ...this.contentFields(dto),
      courseId: lesson.courseId,
      lessonId,
      title: dto.title,
      required: dto.required,
      order: (last?.order ?? 0) + 1,
      contentVersion: course.contentVersion + 1,
      version: 1,
    });
    const saved = await this.items.save(item);
    await this.bumpCourse(course);
    return learningItemData(saved);
  }

  async update(
    id: string,
    dto: UpdateLearningItemRequest,
    user: AuthUser,
  ): Promise<LearningItemData> {
    const item = await this.findItem(id);
    const { course } = await this.assertEditableLesson(item.lessonId, user);
    this.assertVersion(item.version, dto.expectedVersion);
    const result = await this.items.update(
      { id, version: dto.expectedVersion },
      {
        ...this.contentFields(dto),
        title: dto.title,
        required: dto.required,
        contentVersion: course.contentVersion + 1,
        version: dto.expectedVersion + 1,
      },
    );
    if (!result.affected)
      throw this.versionConflict(dto.expectedVersion, dto.expectedVersion + 1);
    await this.bumpCourse(course);
    return learningItemData(await this.items.findOneByOrFail({ id }));
  }

  async remove(id: string, dto: VersionRequest, user: AuthUser): Promise<void> {
    const item = await this.findItem(id);
    const { course } = await this.assertEditableLesson(item.lessonId, user);
    this.assertVersion(item.version, dto.expectedVersion);
    const result = await this.items.delete({
      id,
      version: dto.expectedVersion,
    });
    if (!result.affected)
      throw this.versionConflict(dto.expectedVersion, dto.expectedVersion + 1);
    await this.items
      .createQueryBuilder()
      .update(LearningItem)
      .set({ order: () => '"order" - 1' })
      .where('"lessonId" = :lessonId AND "order" > :order', {
        lessonId: item.lessonId,
        order: item.order,
      })
      .execute();
    await this.bumpCourse(course);
  }

  async reorder(
    lessonId: string,
    dto: ReorderRequest,
    user: AuthUser,
  ): Promise<CourseOutlineData> {
    const { course } = await this.assertEditableLesson(lessonId, user);
    if (course.version !== dto.expectedVersion)
      throw this.versionConflict(dto.expectedVersion, course.version);
    const items = await this.items.find({
      where: { lessonId },
      order: { order: 'ASC' },
    });
    const actualIds = new Set(items.map((item) => item.id));
    if (
      dto.orderedIds.length !== items.length ||
      dto.orderedIds.some((id) => !actualIds.has(id)) ||
      new Set(dto.orderedIds).size !== dto.orderedIds.length
    )
      throw new ConflictException({
        code: 'VALIDATION_ERROR',
        message: 'orderedIds must contain every learning item exactly once',
        details: {},
      });
    for (const [index, id] of dto.orderedIds.entries()) {
      const item = items.find((value) => value.id === id)!;
      await this.items.update(
        { id, lessonId },
        {
          order: index + 1,
          version: item.version + 1,
          contentVersion: course.contentVersion + 1,
        },
      );
    }
    await this.bumpCourse(course);
    return this.courseOutline(course.id, course.contentVersion + 1);
  }

  private contentFields(
    dto: CreateLearningItemRequest | UpdateLearningItemRequest,
  ): Partial<LearningItem> {
    return {
      type: dto.type,
      videoUrl: dto.type === 'VIDEO' ? dto.videoUrl : null,
      durationSeconds: dto.type === 'VIDEO' ? dto.durationSeconds : null,
      body: dto.type === 'READING' ? dto.body : null,
      quizId: dto.type === 'QUIZ' ? dto.quizId : null,
      assessmentVersion: dto.type === 'QUIZ' ? dto.assessmentVersion : null,
    };
  }

  private async courseOutline(
    courseId: string,
    contentVersion: number,
  ): Promise<CourseOutlineData> {
    const chapters = await this.chapters.find({
      where: { courseId },
      order: { order: 'ASC' },
    });
    const lessons = await this.lessons.find({
      where: { courseId },
      order: { order: 'ASC' },
    });
    const items = await this.items.find({
      where: { courseId },
      order: { order: 'ASC' },
    });
    return {
      courseId,
      contentVersion,
      chapters: chapters.map((chapter) => ({
        id: chapter.id,
        courseId,
        title: chapter.title,
        order: chapter.order,
        version: chapter.version,
        lessons: lessons
          .filter((lesson) => lesson.chapterId === chapter.id)
          .map((lesson) => ({
            id: lesson.id,
            courseId,
            chapterId: lesson.chapterId,
            title: lesson.title,
            order: lesson.order,
            version: lesson.version,
            items: items
              .filter((item) => item.lessonId === lesson.id)
              .map(learningItemData),
          })),
      })),
    };
  }

  private async findItem(id: string): Promise<LearningItem> {
    const item = await this.items.findOneBy({ id });
    if (!item) throw new NotFoundException('Learning item not found');
    return item;
  }

  private async assertEditableLesson(
    lessonId: string,
    user: AuthUser,
  ): Promise<{ lesson: Lesson; course: Course }> {
    if (user.role !== 'INSTRUCTOR' || user.status !== 'ACTIVE')
      throw new ForbiddenException('Active instructor account required');
    const lesson = await this.lessons.findOneBy({ id: lessonId });
    if (!lesson) throw new NotFoundException('Lesson not found');
    const course = await this.courses.findOneBy({ id: lesson.courseId });
    if (!course) throw new NotFoundException('Course not found');
    if (course.instructorId !== user.id)
      throw new ForbiddenException('Course ownership required');
    if (course.status === 'PUBLISHED')
      throw new ConflictException({
        code: 'INVALID_COURSE_TRANSITION',
        message: 'Published course content must be updated through a revision',
        details: {},
      });
    return { lesson, course };
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
