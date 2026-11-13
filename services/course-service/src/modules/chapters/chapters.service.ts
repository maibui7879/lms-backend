import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type {
  AuthUser,
  ChapterData,
  CourseOutlineData,
  CreateChapterRequest,
  ReorderRequest,
  UpdateChapterRequest,
  VersionRequest,
} from '@lms/contracts';
import { DataSource, Repository } from 'typeorm';
import { Course } from '../courses/entities/course.entity';
import { Chapter } from './entities/chapter.entity';

export function chapterData(chapter: Chapter): ChapterData {
  return {
    id: chapter.id,
    courseId: chapter.courseId,
    revisionId: chapter.courseId,
    title: chapter.title,
    order: chapter.order,
    version: chapter.version,
    endSectionQuiz: null,
  };
}

@Injectable()
export class ChaptersService {
  constructor(
    @InjectRepository(Chapter) private readonly chapters: Repository<Chapter>,
    @InjectRepository(Course) private readonly courses: Repository<Course>,
    private readonly dataSource: DataSource,
  ) {}

  async create(
    courseId: string,
    dto: CreateChapterRequest,
    user: AuthUser,
  ): Promise<ChapterData> {
    const course = await this.assertEditableCourse(courseId, user);
    const last = await this.chapters.findOne({
      where: { courseId },
      order: { order: 'DESC' },
    });
    const chapter = this.chapters.create({
      courseId,
      title: dto.title,
      order: (last?.order ?? 0) + 1,
      version: 1,
    });
    const saved = await this.chapters.save(chapter);
    await this.bumpCourse(course);
    return chapterData(saved);
  }

  async update(
    id: string,
    dto: UpdateChapterRequest,
    user: AuthUser,
  ): Promise<ChapterData> {
    const chapter = await this.findChapter(id);
    const course = await this.assertEditableCourse(chapter.courseId, user);
    this.assertChapterVersion(chapter, dto.expectedVersion);
    const result = await this.chapters.update(
      { id, version: dto.expectedVersion },
      { title: dto.title, version: dto.expectedVersion + 1 },
    );
    if (!result.affected)
      throw this.versionConflict(dto.expectedVersion, dto.expectedVersion + 1);
    await this.bumpCourse(course);
    return chapterData(await this.chapters.findOneByOrFail({ id }));
  }

  async remove(id: string, dto: VersionRequest, user: AuthUser): Promise<void> {
    const chapter = await this.findChapter(id);
    const course = await this.assertEditableCourse(chapter.courseId, user);
    this.assertChapterVersion(chapter, dto.expectedVersion);
    const result = await this.chapters.delete({
      id,
      version: dto.expectedVersion,
    });
    if (!result.affected)
      throw this.versionConflict(dto.expectedVersion, dto.expectedVersion + 1);
    await this.chapters
      .createQueryBuilder()
      .update(Chapter)
      .set({ order: () => '"order" - 1' })
      .where('"courseId" = :courseId AND "order" > :order', {
        courseId: chapter.courseId,
        order: chapter.order,
      })
      .execute();
    await this.bumpCourse(course);
  }

  async reorder(
    courseId: string,
    dto: ReorderRequest,
    user: AuthUser,
  ): Promise<CourseOutlineData> {
    const course = await this.assertEditableCourse(courseId, user);
    if (course.version !== dto.expectedVersion)
      throw this.versionConflict(dto.expectedVersion, course.version);
    const chapters = await this.chapters.find({
      where: { courseId },
      order: { order: 'ASC' },
    });
    const actualIds = new Set(chapters.map((chapter) => chapter.id));
    if (
      dto.orderedIds.length !== chapters.length ||
      dto.orderedIds.some((id) => !actualIds.has(id))
    )
      throw new ConflictException({
        code: 'VALIDATION_ERROR',
        message: 'orderedIds must contain every chapter exactly once',
        details: {},
      });
    await this.dataSource.transaction(async (manager) => {
      for (const [index, id] of dto.orderedIds.entries()) {
        const chapter = chapters.find((item) => item.id === id)!;
        await manager.update(
          Chapter,
          { id, courseId },
          {
            order: index + 1,
            version: chapter.version + 1,
          },
        );
      }
      await manager.update(
        Course,
        { id: courseId, version: dto.expectedVersion },
        {
          version: dto.expectedVersion + 1,
          contentVersion: course.contentVersion + 1,
        },
      );
    });
    const ordered = await this.chapters.find({
      where: { courseId },
      order: { order: 'ASC' },
    });
    return {
      courseId,
      revisionId: course.id,
      contentVersion: course.contentVersion + 1,
      chapters: ordered.map((chapter) => ({
        ...chapterData(chapter),
        lessons: [],
      })),
    };
  }

  private async findChapter(id: string): Promise<Chapter> {
    const chapter = await this.chapters.findOneBy({ id });
    if (!chapter) throw new NotFoundException('Chapter not found');
    return chapter;
  }

  private async assertEditableCourse(
    courseId: string,
    user: AuthUser,
  ): Promise<Course> {
    if (user.role !== 'INSTRUCTOR' || user.status !== 'ACTIVE')
      throw new ForbiddenException('Active instructor account required');
    const course = await this.courses.findOneBy({ id: courseId });
    if (!course) throw new NotFoundException('Course not found');
    if (course.instructorId !== user.id)
      throw new ForbiddenException('Course ownership required');
    if (course.status === 'PUBLISHED')
      throw new ConflictException({
        code: 'INVALID_COURSE_TRANSITION',
        message: 'Published course content must be updated through a revision',
        details: {},
      });
    return course;
  }

  private assertChapterVersion(
    chapter: Chapter,
    expectedVersion: number,
  ): void {
    if (chapter.version !== expectedVersion)
      throw this.versionConflict(expectedVersion, chapter.version);
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
