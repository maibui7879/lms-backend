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
  RevisionReorderRequest,
  RevisionVersionRequest,
  UpdateLearningItemRequest,
  VersionRequest,
} from '@lms/contracts';
import { IsNull, Repository } from 'typeorm';
import { Course } from '../courses/entities/course.entity';
import { CourseRevision } from '../course-revisions/entities/course-revision.entity';
import { Chapter } from '../chapters/entities/chapter.entity';
import { Lesson } from '../lessons/entities/lesson.entity';
import { LearningItem } from './entities/learning-item.entity';

export function learningItemData(item: LearningItem): LearningItemData {
  const base = {
    id: item.id,
    courseId: item.courseId,
    lessonId: item.lessonId,
    revisionId: item.revisionId ?? item.courseId,
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
    @InjectRepository(CourseRevision)
    private readonly revisions: Repository<CourseRevision>,
  ) {}

  async create(
    lessonId: string,
    dto: CreateLearningItemRequest,
    user: AuthUser,
  ): Promise<LearningItemData> {
    const { lesson, course, revision } = await this.assertEditableLesson(
      lessonId,
      dto.revisionId,
      user,
    );
    const last = await this.items.findOne({
      where: { lessonId, revisionId: revision?.id ?? IsNull() },
      order: { order: 'DESC' },
    });
    const item = this.items.create({
      ...this.contentFields(dto),
      courseId: lesson.courseId,
      lessonId,
      title: dto.title,
      required: dto.required,
      order: (last?.order ?? 0) + 1,
      revisionId: revision?.id ?? null,
      contentVersion: revision?.baseContentVersion ?? course.contentVersion + 1,
      version: 1,
    });
    const saved = await this.items.save(item);
    await this.bumpContent(course, revision);
    return learningItemData(saved);
  }

  async update(
    id: string,
    dto: UpdateLearningItemRequest,
    user: AuthUser,
  ): Promise<LearningItemData> {
    const item = await this.findItem(id);
    const { course, revision } = await this.assertEditableLesson(
      item.lessonId,
      dto.revisionId,
      user,
    );
    this.assertBelongsToRevision(item.revisionId, revision?.id);
    this.assertVersion(item.version, dto.expectedVersion);
    const result = await this.items.update(
      {
        id,
        version: dto.expectedVersion,
        revisionId: revision?.id ?? IsNull(),
      },
      {
        ...this.contentFields(dto),
        title: dto.title,
        required: dto.required,
        contentVersion:
          revision?.baseContentVersion ?? course.contentVersion + 1,
        version: dto.expectedVersion + 1,
      },
    );
    if (!result.affected)
      throw this.versionConflict(dto.expectedVersion, dto.expectedVersion + 1);
    await this.bumpContent(course, revision);
    return learningItemData(await this.items.findOneByOrFail({ id }));
  }

  async remove(
    id: string,
    dto: RevisionVersionRequest,
    user: AuthUser,
  ): Promise<void> {
    const item = await this.findItem(id);
    const { course, revision } = await this.assertEditableLesson(
      item.lessonId,
      dto.revisionId,
      user,
    );
    this.assertBelongsToRevision(item.revisionId, revision?.id);
    this.assertVersion(item.version, dto.expectedVersion);
    const result = await this.items.delete({
      id,
      version: dto.expectedVersion,
      revisionId: revision?.id ?? IsNull(),
    });
    if (!result.affected)
      throw this.versionConflict(dto.expectedVersion, dto.expectedVersion + 1);
    await this.items
      .createQueryBuilder()
      .update(LearningItem)
      .set({ order: () => '"order" - 1' })
      .where(
        '"lessonId" = :lessonId AND "revisionId" IS NOT DISTINCT FROM :revisionId AND "order" > :order',
        {
          lessonId: item.lessonId,
          revisionId: revision?.id ?? null,
          order: item.order,
        },
      )
      .execute();
    await this.bumpContent(course, revision);
  }

  async reorder(
    lessonId: string,
    dto: RevisionReorderRequest,
    user: AuthUser,
  ): Promise<CourseOutlineData> {
    const { course, revision } = await this.assertEditableLesson(
      lessonId,
      dto.revisionId,
      user,
    );
    if ((revision?.version ?? course.version) !== dto.expectedVersion)
      throw this.versionConflict(dto.expectedVersion, course.version);
    const items = await this.items.find({
      where: { lessonId, revisionId: revision?.id ?? IsNull() },
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
        { id, lessonId, revisionId: revision?.id ?? IsNull() },
        {
          order: index + 1,
          version: item.version + 1,
          contentVersion:
            revision?.baseContentVersion ?? course.contentVersion + 1,
        },
      );
    }
    await this.bumpContent(course, revision);
    return this.courseOutline(
      course.id,
      revision?.baseContentVersion ?? course.contentVersion + 1,
      revision?.id,
    );
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
    revisionId?: string,
  ): Promise<CourseOutlineData> {
    const chapters = await this.chapters.find({
      where: { courseId, revisionId: revisionId ?? IsNull() },
      order: { order: 'ASC' },
    });
    const lessons = await this.lessons.find({
      where: { courseId, revisionId: revisionId ?? IsNull() },
      order: { order: 'ASC' },
    });
    const items = await this.items.find({
      where: { courseId, revisionId: revisionId ?? IsNull() },
      order: { order: 'ASC' },
    });
    return {
      courseId,
      revisionId: revisionId ?? courseId,
      contentVersion,
      chapters: chapters.map((chapter) => ({
        id: chapter.id,
        courseId,
        revisionId: revisionId ?? courseId,
        title: chapter.title,
        order: chapter.order,
        version: chapter.version,
        endSectionQuiz: null,
        lessons: lessons
          .filter((lesson) => lesson.chapterId === chapter.id)
          .map((lesson) => ({
            id: lesson.id,
            courseId,
            revisionId: revisionId ?? courseId,
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
    revisionId: string | undefined,
    user: AuthUser,
  ): Promise<{
    lesson: Lesson;
    course: Course;
    revision: CourseRevision | null;
  }> {
    if (user.role !== 'INSTRUCTOR' || user.status !== 'ACTIVE')
      throw new ForbiddenException('Active instructor account required');
    const lesson = await this.lessons.findOneBy({ id: lessonId });
    if (!lesson) throw new NotFoundException('Lesson not found');
    const course = await this.courses.findOneBy({ id: lesson.courseId });
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
        (await this.lessons.findOneBy({ id: lessonId }))?.revisionId !==
        revision.id
      )
        throw new ConflictException({
          code: 'REVISION_CONTENT_MISMATCH',
          message: 'Content does not belong to the requested course revision',
          details: {},
        });
      return { lesson, course, revision };
    }
    if (course.status === 'PUBLISHED' || course.status === 'IN_REVIEW')
      throw new ConflictException({
        code: 'INVALID_COURSE_TRANSITION',
        message:
          'Published or in-review course content must be updated through a revision',
        details: {},
      });
    return { lesson, course, revision: null };
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
