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
  RevisionReorderRequest,
  RevisionVersionRequest,
  UpdateChapterRequest,
} from '@lms/contracts';
import { DataSource, IsNull, Repository } from 'typeorm';
import { Course } from '../courses/entities/course.entity';
import { CourseRevision } from '../course-revisions/entities/course-revision.entity';
import { Chapter } from './entities/chapter.entity';

export function chapterData(chapter: Chapter): ChapterData {
  return {
    id: chapter.id,
    courseId: chapter.courseId,
    revisionId: chapter.revisionId ?? chapter.courseId,
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
    @InjectRepository(CourseRevision)
    private readonly revisions: Repository<CourseRevision>,
    private readonly dataSource: DataSource,
  ) {}

  async create(
    courseId: string,
    dto: CreateChapterRequest,
    user: AuthUser,
  ): Promise<ChapterData> {
    const { course, revision } = await this.assertEditableCourse(
      courseId,
      dto.revisionId,
      user,
    );
    const last = await this.chapters.findOne({
      where: { courseId, revisionId: revision?.id ?? IsNull() },
      order: { order: 'DESC' },
    });
    const saved = await this.chapters.save(
      this.chapters.create({
        courseId,
        revisionId: revision?.id ?? null,
        title: dto.title,
        order: (last?.order ?? 0) + 1,
        version: 1,
      }),
    );
    await this.bumpContent(course, revision);
    return chapterData(saved);
  }

  async update(
    id: string,
    dto: UpdateChapterRequest,
    user: AuthUser,
  ): Promise<ChapterData> {
    const chapter = await this.findChapter(id);
    const { course, revision } = await this.assertEditableCourse(
      chapter.courseId,
      dto.revisionId,
      user,
    );
    this.assertBelongsToRevision(chapter.revisionId, revision?.id);
    this.assertVersion(chapter.version, dto.expectedVersion);
    const result = await this.chapters.update(
      {
        id,
        version: dto.expectedVersion,
        revisionId: revision?.id ?? IsNull(),
      },
      { title: dto.title, version: dto.expectedVersion + 1 },
    );
    if (!result.affected)
      throw this.versionConflict(dto.expectedVersion, dto.expectedVersion + 1);
    await this.bumpContent(course, revision);
    return chapterData(await this.chapters.findOneByOrFail({ id }));
  }

  async remove(
    id: string,
    dto: RevisionVersionRequest,
    user: AuthUser,
  ): Promise<void> {
    const chapter = await this.findChapter(id);
    const { course, revision } = await this.assertEditableCourse(
      chapter.courseId,
      dto.revisionId,
      user,
    );
    this.assertBelongsToRevision(chapter.revisionId, revision?.id);
    this.assertVersion(chapter.version, dto.expectedVersion);
    const result = await this.chapters.delete({
      id,
      version: dto.expectedVersion,
      revisionId: revision?.id ?? IsNull(),
    });
    if (!result.affected)
      throw this.versionConflict(dto.expectedVersion, dto.expectedVersion + 1);
    await this.chapters
      .createQueryBuilder()
      .update(Chapter)
      .set({ order: () => '"order" - 1' })
      .where(
        '"courseId" = :courseId AND "revisionId" IS NOT DISTINCT FROM :revisionId AND "order" > :order',
        {
          courseId: chapter.courseId,
          revisionId: revision?.id ?? null,
          order: chapter.order,
        },
      )
      .execute();
    await this.bumpContent(course, revision);
  }

  async reorder(
    courseId: string,
    dto: RevisionReorderRequest,
    user: AuthUser,
  ): Promise<CourseOutlineData> {
    const { course, revision } = await this.assertEditableCourse(
      courseId,
      dto.revisionId,
      user,
    );
    this.assertVersion(
      revision?.version ?? course.version,
      dto.expectedVersion,
    );
    const chapters = await this.chapters.find({
      where: { courseId, revisionId: revision?.id ?? IsNull() },
      order: { order: 'ASC' },
    });
    const actualIds = new Set(chapters.map((chapter) => chapter.id));
    if (
      dto.orderedIds.length !== chapters.length ||
      dto.orderedIds.some((id) => !actualIds.has(id)) ||
      new Set(dto.orderedIds).size !== dto.orderedIds.length
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
          { id, courseId, revisionId: revision?.id ?? IsNull() },
          { order: index + 1, version: chapter.version + 1 },
        );
      }
      if (revision)
        await manager.update(
          CourseRevision,
          { id: revision.id, version: dto.expectedVersion },
          { version: dto.expectedVersion + 1 },
        );
      else
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
      where: { courseId, revisionId: revision?.id ?? IsNull() },
      order: { order: 'ASC' },
    });
    return {
      courseId,
      revisionId: revision?.id ?? course.id,
      contentVersion: revision?.baseContentVersion ?? course.contentVersion + 1,
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
    revisionId: string | undefined,
    user: AuthUser,
  ): Promise<{ course: Course; revision: CourseRevision | null }> {
    if (user.role !== 'INSTRUCTOR' || user.status !== 'ACTIVE')
      throw new ForbiddenException('Active instructor account required');
    const course = await this.courses.findOneBy({ id: courseId });
    if (!course) throw new NotFoundException('Course not found');
    if (course.instructorId !== user.id)
      throw new ForbiddenException('Course ownership required');
    if (revisionId) {
      const revision = await this.revisions.findOneBy({
        id: revisionId,
        courseId,
      });
      if (!revision) throw new NotFoundException('Course revision not found');
      if (!['DRAFT', 'REJECTED'].includes(revision.status))
        throw this.invalidTransition(
          'Only draft or rejected revisions can be edited',
        );
      return { course, revision };
    }
    if (course.status === 'PUBLISHED' || course.status === 'IN_REVIEW')
      throw this.invalidTransition(
        'Published or in-review course content must be updated through a revision',
      );
    return { course, revision: null };
  }

  private assertBelongsToRevision(
    actual: string | null,
    expected?: string,
  ): void {
    if ((actual ?? undefined) !== expected)
      throw new ConflictException({
        code: 'REVISION_CONTENT_MISMATCH',
        message: 'Content does not belong to the requested course revision',
        details: {},
      });
  }
  private assertVersion(current: number, expected: number): void {
    if (current !== expected) throw this.versionConflict(expected, current);
  }
  private async bumpContent(
    course: Course,
    revision: CourseRevision | null,
  ): Promise<void> {
    if (revision) {
      const result = await this.revisions.update(
        { id: revision.id, version: revision.version },
        { version: revision.version + 1 },
      );
      if (!result.affected)
        throw this.versionConflict(revision.version, revision.version + 1);
      return;
    }
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
  private invalidTransition(message: string): ConflictException {
    return new ConflictException({
      code: 'INVALID_COURSE_TRANSITION',
      message,
      details: {},
    });
  }
  private versionConflict(expectedVersion: number, currentVersion: number) {
    return new ConflictException({
      code: 'VERSION_CONFLICT',
      message: 'Resource was changed by another request',
      details: { expectedVersion, currentVersion },
    });
  }
}
