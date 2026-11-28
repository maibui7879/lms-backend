import { contentTransaction } from '../../common/content-transaction';
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
  RevisionReorderRequest,
  RevisionVersionRequest,
  UpdateLessonRequest,
} from '@lms/contracts';
import { IsNull, Repository } from 'typeorm';
import { Course } from '../courses/entities/course.entity';
import { CourseRevision } from '../course-revisions/entities/course-revision.entity';
import { Chapter } from '../chapters/entities/chapter.entity';
import { Lesson } from './entities/lesson.entity';
import { LearningItem } from '../learning-items/entities/learning-item.entity';

export function lessonData(lesson: Lesson): LessonData {
  return {
    id: lesson.id,
    courseId: lesson.courseId,
    revisionId: lesson.revisionId ?? lesson.courseId,
    chapterId: lesson.chapterId,
    title: lesson.title,
    order: lesson.order,
    version: lesson.version,
  };
}

@Injectable()
export class LessonsService {
  private inTransaction = false;
  constructor(
    @InjectRepository(Lesson) private readonly lessons: Repository<Lesson>,
    @InjectRepository(Chapter) private readonly chapters: Repository<Chapter>,
    @InjectRepository(Course) private readonly courses: Repository<Course>,
    @InjectRepository(CourseRevision)
    private readonly revisions: Repository<CourseRevision>,
  ) {}

  async create(
    chapterId: string,
    dto: CreateLessonRequest,
    user: AuthUser,
  ): Promise<LessonData> {
    if (!this.inTransaction) {
      return contentTransaction(
        this.lessons.manager.connection,
        Chapter,
        chapterId,
        async (manager) => {
          const service = new LessonsService(
            manager.getRepository(Lesson),
            manager.getRepository(Chapter),
            manager.getRepository(Course),
            manager.getRepository(CourseRevision),
          );
          service.inTransaction = true;
          return service.create(chapterId, dto, user);
        },
      );
    }
    const { chapter, course, revision } = await this.assertEditableChapter(
      chapterId,
      dto.revisionId,
      user,
    );
    const last = await this.lessons.findOne({
      where: { chapterId, revisionId: revision?.id ?? IsNull() },
      order: { order: 'DESC' },
    });
    const lesson = this.lessons.create({
      courseId: chapter.courseId,
      revisionId: revision?.id ?? null,
      chapterId,
      title: dto.title,
      order: (last?.order ?? 0) + 1,
      version: 1,
    });
    const saved = await this.lessons.save(lesson);
    await this.bumpContent(course, revision);
    return lessonData(saved);
  }

  async update(
    id: string,
    dto: UpdateLessonRequest,
    user: AuthUser,
  ): Promise<LessonData> {
    if (!this.inTransaction) {
      return contentTransaction(
        this.lessons.manager.connection,
        Lesson,
        id,
        async (manager) => {
          const service = new LessonsService(
            manager.getRepository(Lesson),
            manager.getRepository(Chapter),
            manager.getRepository(Course),
            manager.getRepository(CourseRevision),
          );
          service.inTransaction = true;
          return service.update(id, dto, user);
        },
      );
    }
    const lesson = await this.findLesson(id);
    const { course, revision } = await this.assertEditableChapter(
      lesson.chapterId,
      dto.revisionId,
      user,
    );
    this.assertBelongsToRevision(lesson.revisionId, revision?.id);
    this.assertVersion(lesson.version, dto.expectedVersion);
    const result = await this.lessons.update(
      {
        id,
        version: dto.expectedVersion,
        revisionId: revision?.id ?? IsNull(),
      },
      { title: dto.title, version: dto.expectedVersion + 1 },
    );
    if (result.affected !== 1)
      throw this.versionConflict(dto.expectedVersion, dto.expectedVersion + 1);
    await this.bumpContent(course, revision);
    return lessonData(await this.lessons.findOneByOrFail({ id }));
  }

  async remove(
    id: string,
    dto: RevisionVersionRequest,
    user: AuthUser,
  ): Promise<void> {
    if (!this.inTransaction) {
      return contentTransaction(
        this.lessons.manager.connection,
        Lesson,
        id,
        async (manager) => {
          const service = new LessonsService(
            manager.getRepository(Lesson),
            manager.getRepository(Chapter),
            manager.getRepository(Course),
            manager.getRepository(CourseRevision),
          );
          service.inTransaction = true;
          return service.remove(id, dto, user);
        },
      );
    }
    const lesson = await this.findLesson(id);
    const { course, revision } = await this.assertEditableChapter(
      lesson.chapterId,
      dto.revisionId,
      user,
    );
    this.assertBelongsToRevision(lesson.revisionId, revision?.id);
    this.assertVersion(lesson.version, dto.expectedVersion);
    if (
      await this.lessons.manager
        .getRepository(LearningItem)
        .existsBy({ lessonId: id })
    ) {
      throw new ConflictException({
        code: 'CONTENT_NOT_EMPTY',
        message: 'Lesson must be empty before deletion',
        details: {},
      });
    }
    const result = await this.lessons.delete({
      id,
      version: dto.expectedVersion,
      revisionId: revision?.id ?? IsNull(),
    });
    if (result.affected !== 1)
      throw this.versionConflict(dto.expectedVersion, dto.expectedVersion + 1);
    const siblings = await this.lessons.find({
      where: {
        chapterId: lesson.chapterId,
        revisionId: revision?.id ?? IsNull(),
      },
      order: { order: 'ASC' },
    });
    for (const sibling of siblings.filter((row) => row.order > lesson.order)) {
      const shifted = await this.lessons.update(
        {
          id: sibling.id,
          version: sibling.version,
          revisionId: revision?.id ?? IsNull(),
        },
        { order: sibling.order - 1, version: sibling.version + 1 },
      );
      if (shifted.affected !== 1)
        throw this.versionConflict(sibling.version, sibling.version + 1);
    }
    await this.bumpContent(course, revision);
  }

  async reorder(
    chapterId: string,
    dto: RevisionReorderRequest,
    user: AuthUser,
  ): Promise<LessonData[]> {
    if (!this.inTransaction) {
      return contentTransaction(
        this.lessons.manager.connection,
        Chapter,
        chapterId,
        async (manager) => {
          const service = new LessonsService(
            manager.getRepository(Lesson),
            manager.getRepository(Chapter),
            manager.getRepository(Course),
            manager.getRepository(CourseRevision),
          );
          service.inTransaction = true;
          return service.reorder(chapterId, dto, user);
        },
      );
    }
    const { chapter, course, revision } = await this.assertEditableChapter(
      chapterId,
      dto.revisionId,
      user,
    );
    if ((revision?.version ?? course.version) !== dto.expectedVersion)
      throw this.versionConflict(
        dto.expectedVersion,
        revision?.version ?? course.version,
      );
    const lessons = await this.lessons.find({
      where: { chapterId, revisionId: revision?.id ?? IsNull() },
      order: { order: 'ASC' },
    });
    const actualIds = new Set(lessons.map((lesson) => lesson.id));
    if (
      dto.orderedIds.length !== lessons.length ||
      dto.orderedIds.some((id) => !actualIds.has(id)) ||
      new Set(dto.orderedIds).size !== dto.orderedIds.length
    )
      throw new ConflictException({
        code: 'VALIDATION_ERROR',
        message: 'orderedIds must contain every lesson exactly once',
        details: {},
      });
    for (const [index, id] of dto.orderedIds.entries()) {
      const lesson = lessons.find((item) => item.id === id)!;
      const result = await this.lessons.update(
        {
          id,
          chapterId,
          revisionId: revision?.id ?? IsNull(),
          version: lesson.version,
        },
        { order: index + 1, version: lesson.version + 1 },
      );
      if (result.affected !== 1)
        throw this.versionConflict(lesson.version, lesson.version + 1);
    }
    await this.bumpContent(course, revision);
    const ordered = await this.lessons.find({
      where: { chapterId, revisionId: revision?.id ?? IsNull() },
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
    revisionId: string | undefined,
    user: AuthUser,
  ): Promise<{
    chapter: Chapter;
    course: Course;
    revision: CourseRevision | null;
  }> {
    if (user.role !== 'INSTRUCTOR' || user.status !== 'ACTIVE')
      throw new ForbiddenException('Active instructor account required');
    const chapter = await this.chapters.findOneBy({ id: chapterId });
    if (!chapter) throw new NotFoundException('Chapter not found');
    const course = await this.courses.findOneBy({ id: chapter.courseId });
    if (!course) throw new NotFoundException('Course not found');
    if (course.instructorId !== user.id)
      throw new ForbiddenException('Course ownership required');
    if (revisionId) {
      const revision = await this.revisions.findOneBy({
        id: revisionId,
        courseId: course.id,
      });
      if (!revision) throw new NotFoundException('Course revision not found');
      if (!['DRAFT', 'REJECTED'].includes(revision.status))
        throw new ConflictException({
          code: 'INVALID_COURSE_TRANSITION',
          message: 'Only draft or rejected revisions can be edited',
          details: {},
        });
      if (
        (await this.chapters.findOneBy({ id: chapterId }))?.revisionId !==
        revision.id
      )
        throw new ConflictException({
          code: 'REVISION_CONTENT_MISMATCH',
          message: 'Content does not belong to the requested course revision',
          details: {},
        });
      return { chapter, course, revision };
    }
    this.assertBelongsToRevision(chapter.revisionId, undefined);
    if (course.status === 'PUBLISHED' || course.status === 'IN_REVIEW')
      throw new ConflictException({
        code: 'INVALID_COURSE_TRANSITION',
        message:
          'Published or in-review course content must be updated through a revision',
        details: {},
      });
    return { chapter, course, revision: null };
  }

  private assertVersion(currentVersion: number, expectedVersion: number): void {
    if (currentVersion !== expectedVersion)
      throw this.versionConflict(expectedVersion, currentVersion);
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
      if (result.affected !== 1)
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
    if (result.affected !== 1)
      throw this.versionConflict(course.version, course.version + 1);
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

  private versionConflict(expectedVersion: number, currentVersion: number) {
    return new ConflictException({
      code: 'VERSION_CONFLICT',
      message: 'Resource was changed by another request',
      details: { expectedVersion, currentVersion },
    });
  }
}
