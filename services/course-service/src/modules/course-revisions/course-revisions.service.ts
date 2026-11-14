import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type {
  AuthUser,
  CourseData,
  CourseReviewData,
  PageData,
  PageQuery,
  CourseRevisionData,
  CreateCourseRevisionRequest,
  ReviewCourseRevisionRequest,
  ReviewCourseRequest,
  VersionRequest,
} from '@lms/contracts';
import { Repository } from 'typeorm';
import { Course } from '../courses/entities/course.entity';
import { courseData } from '../courses/courses.service';
import { CourseReview } from './entities/course-review.entity';
import { CourseRevision } from './entities/course-revision.entity';
import { Chapter } from '../chapters/entities/chapter.entity';
import { Lesson } from '../lessons/entities/lesson.entity';
import { LearningItem } from '../learning-items/entities/learning-item.entity';
import { DataSource, In } from 'typeorm';

@Injectable()
export class CourseRevisionsService {
  constructor(
    @InjectRepository(Course)
    private readonly courses: Repository<Course>,
    @InjectRepository(CourseReview)
    private readonly reviews: Repository<CourseReview>,
    @InjectRepository(CourseRevision)
    private readonly revisions: Repository<CourseRevision>,
    @InjectRepository(Chapter)
    private readonly chapters: Repository<Chapter>,
    @InjectRepository(Lesson)
    private readonly lessons: Repository<Lesson>,
    @InjectRepository(LearningItem)
    private readonly items: Repository<LearningItem>,
    private readonly dataSource: DataSource,
  ) {}

  async createRevision(
    courseId: string,
    dto: CreateCourseRevisionRequest,
    user: AuthUser,
  ): Promise<CourseRevisionData> {
    this.requireInstructor(user);
    const course = await this.findCourse(courseId);
    this.assertOwner(course, user);
    if (course.status !== 'PUBLISHED')
      throw this.invalidTransition(
        'Only published courses can create revisions',
      );
    if (course.contentVersion !== dto.baseContentVersion)
      throw this.versionConflict(dto.baseContentVersion, course.contentVersion);
    const active = await this.revisions.findOne({
      where: { courseId, status: In(['DRAFT', 'IN_REVIEW']) },
    });
    if (active)
      throw new ConflictException({
        code: 'REVISION_ALREADY_EXISTS',
        message: 'Course already has an active revision',
        details: { revisionId: active.id },
      });

    const revision = await this.dataSource.transaction(async (manager) => {
      const created = await manager.save(
        manager.create(CourseRevision, {
          courseId,
          baseContentVersion: dto.baseContentVersion,
          contentVersion: null,
          status: 'DRAFT',
          createdBy: user.id,
          submittedAt: null,
          publishedAt: null,
          version: 1,
          updateType: dto.updateType,
          migrationPolicy: dto.migrationPolicy,
        }),
      );
      const sourceChapters = await manager.find(Chapter, {
        where: { courseId },
        order: { order: 'ASC' },
      });
      const chapterMap = new Map<string, string>();
      for (const source of sourceChapters) {
        const clone = await manager.save(
          manager.create(Chapter, {
            courseId,
            revisionId: created.id,
            title: source.title,
            order: source.order,
            version: 1,
          }),
        );
        chapterMap.set(source.id, clone.id);
      }
      const sourceLessons = await manager.find(Lesson, { where: { courseId } });
      const lessonMap = new Map<string, string>();
      for (const source of sourceLessons) {
        const clone = await manager.save(
          manager.create(Lesson, {
            courseId,
            revisionId: created.id,
            chapterId: chapterMap.get(source.chapterId) ?? source.chapterId,
            title: source.title,
            order: source.order,
            version: 1,
          }),
        );
        lessonMap.set(source.id, clone.id);
      }
      const sourceItems = await manager.find(LearningItem, {
        where: { courseId },
      });
      for (const source of sourceItems) {
        await manager.save(
          manager.create(LearningItem, {
            courseId,
            revisionId: created.id,
            lessonId: lessonMap.get(source.lessonId) ?? source.lessonId,
            title: source.title,
            type: source.type,
            videoUrl: source.videoUrl,
            durationSeconds: source.durationSeconds,
            body: source.body,
            quizId: source.quizId,
            assessmentVersion: source.assessmentVersion,
            required: source.required,
            order: source.order,
            contentVersion: dto.baseContentVersion,
            version: 1,
          }),
        );
      }
      return created;
    });
    return revisionData(revision);
  }

  async listRevisions(
    courseId: string,
    query: PageQuery,
    user: AuthUser,
  ): Promise<PageData<CourseRevisionData>> {
    this.requireInstructor(user);
    const course = await this.findCourse(courseId);
    this.assertOwner(course, user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [rows, total] = await this.revisions.findAndCount({
      where: { courseId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items: rows.map(revisionData), page, limit, total };
  }

  async getRevision(id: string, user: AuthUser): Promise<CourseRevisionData> {
    this.requireInstructor(user);
    const revision = await this.revisions.findOneBy({ id });
    if (!revision) throw new NotFoundException('Course revision not found');
    const course = await this.findCourse(revision.courseId);
    this.assertOwner(course, user);
    return revisionData(revision);
  }

  async submitRevision(
    id: string,
    dto: VersionRequest,
    user: AuthUser,
  ): Promise<CourseRevisionData> {
    this.requireInstructor(user);
    const revision = await this.findRevision(id);
    const course = await this.findCourse(revision.courseId);
    this.assertOwner(course, user);
    if (revision.version !== dto.expectedVersion)
      throw this.versionConflict(dto.expectedVersion, revision.version);
    if (revision.status !== 'DRAFT' && revision.status !== 'REJECTED')
      throw this.invalidTransition(
        'Only draft or rejected revisions can be submitted',
      );
    const result = await this.revisions.update(
      { id, version: dto.expectedVersion, status: revision.status },
      {
        status: 'IN_REVIEW',
        submittedAt: new Date(),
        version: dto.expectedVersion + 1,
      },
    );
    if (!result.affected)
      throw this.versionConflict(dto.expectedVersion, dto.expectedVersion + 1);
    return revisionData(await this.revisions.findOneByOrFail({ id }));
  }

  async reviewRevision(
    id: string,
    dto: ReviewCourseRevisionRequest,
    user: AuthUser,
  ): Promise<CourseRevisionData> {
    this.requireAdmin(user);
    const revision = await this.findRevision(id);
    if (revision.version !== dto.expectedVersion)
      throw this.versionConflict(dto.expectedVersion, revision.version);
    if (revision.status !== 'IN_REVIEW')
      throw this.invalidTransition('Only revisions in review can be reviewed');
    const nextStatus = dto.decision === 'APPROVE' ? 'PUBLISHED' : 'REJECTED';
    const nextContentVersion =
      dto.decision === 'APPROVE' ? revision.baseContentVersion + 1 : null;
    await this.dataSource.transaction(async (manager) => {
      await manager.update(
        CourseRevision,
        { id, version: dto.expectedVersion, status: 'IN_REVIEW' },
        {
          status: nextStatus,
          contentVersion: nextContentVersion,
          publishedAt: dto.decision === 'APPROVE' ? new Date() : null,
          version: dto.expectedVersion + 1,
        },
      );
      if (dto.decision === 'APPROVE') {
        await manager.update(
          Course,
          {
            id: revision.courseId,
            contentVersion: revision.baseContentVersion,
          },
          { contentVersion: revision.baseContentVersion + 1 },
        );
      }
    });
    return revisionData(await this.revisions.findOneByOrFail({ id }));
  }

  async submit(
    id: string,
    dto: VersionRequest,
    user: AuthUser,
  ): Promise<CourseData> {
    this.requireInstructor(user);
    const course = await this.findCourse(id);
    this.assertOwner(course, user);
    this.assertVersion(course, dto.expectedVersion);
    if (!['DRAFT', 'REJECTED'].includes(course.status))
      throw this.invalidTransition(
        'Only draft or rejected courses can be submitted',
      );

    const nextVersion = course.version + 1;
    const result = await this.courses.update(
      { id, instructorId: user.id, version: dto.expectedVersion },
      { status: 'IN_REVIEW', version: nextVersion },
    );
    if (!result.affected)
      throw this.versionConflict(dto.expectedVersion, nextVersion);
    return courseData(await this.courses.findOneByOrFail({ id }));
  }

  async reviewQueue(
    query: PageQuery,
    user: AuthUser,
  ): Promise<PageData<CourseData>> {
    this.requireAdmin(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [rows, total] = await this.courses.findAndCount({
      where: { status: 'IN_REVIEW' },
      order: { updatedAt: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items: rows.map(courseData), page, limit, total };
  }

  async review(
    id: string,
    dto: ReviewCourseRequest,
    user: AuthUser,
  ): Promise<CourseReviewData> {
    this.requireAdmin(user);
    const course = await this.findCourse(id);
    this.assertVersion(course, dto.expectedVersion);
    if (course.status !== 'IN_REVIEW')
      throw this.invalidTransition('Only courses in review can be reviewed');

    const nextVersion = course.version + 1;
    const status = dto.decision === 'APPROVE' ? 'PUBLISHED' : 'REJECTED';
    const result = await this.courses.update(
      { id, version: dto.expectedVersion, status: 'IN_REVIEW' },
      { status, version: nextVersion },
    );
    if (!result.affected)
      throw this.versionConflict(dto.expectedVersion, nextVersion);
    const saved = await this.reviews.save(
      this.reviews.create({
        courseId: id,
        decision: dto.decision,
        status,
        reviewedBy: user.id,
        reviewedAt: new Date(),
        rejectionReason: dto.decision === 'REJECT' ? dto.reason : null,
        version: nextVersion,
      }),
    );
    return reviewData(saved);
  }

  async listReviews(
    id: string,
    query: PageQuery,
    user: AuthUser,
  ): Promise<PageData<CourseReviewData>> {
    const course = await this.findCourse(id);
    if (user.role !== 'ADMIN' && course.instructorId !== user.id)
      throw new ForbiddenException('Course ownership required');
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [rows, total] = await this.reviews.findAndCount({
      where: { courseId: id },
      order: { reviewedAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items: rows.map(reviewData), page, limit, total };
  }

  private async findCourse(id: string): Promise<Course> {
    const course = await this.courses.findOneBy({ id });
    if (!course) throw new NotFoundException('Course not found');
    return course;
  }

  private async findRevision(id: string): Promise<CourseRevision> {
    const revision = await this.revisions.findOneBy({ id });
    if (!revision) throw new NotFoundException('Course revision not found');
    return revision;
  }

  private assertOwner(course: Course, user: AuthUser): void {
    if (course.instructorId !== user.id)
      throw new ForbiddenException('Course ownership required');
  }

  private assertVersion(course: Course, expectedVersion: number): void {
    if (course.version !== expectedVersion)
      throw this.versionConflict(expectedVersion, course.version);
  }

  private requireInstructor(user: AuthUser): void {
    if (user.role !== 'INSTRUCTOR' || user.status !== 'ACTIVE')
      throw new ForbiddenException('Active instructor account required');
  }

  private requireAdmin(user: AuthUser): void {
    if (user.role !== 'ADMIN' || user.status !== 'ACTIVE')
      throw new ForbiddenException('Active admin account required');
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
      message: 'Course was changed by another request',
      details: { expectedVersion, currentVersion },
    });
  }
}

export function reviewData(review: CourseReview): CourseReviewData {
  return {
    id: review.id,
    courseId: review.courseId,
    decision: review.decision,
    status: review.status,
    reviewedBy: review.reviewedBy,
    reviewedAt: review.reviewedAt.toISOString(),
    rejectionReason: review.rejectionReason,
    version: review.version,
  };
}

export function revisionData(revision: CourseRevision): CourseRevisionData {
  return {
    id: revision.id,
    courseId: revision.courseId,
    baseContentVersion: revision.baseContentVersion,
    contentVersion: revision.contentVersion,
    status: revision.status,
    createdBy: revision.createdBy,
    createdAt: revision.createdAt.toISOString(),
    submittedAt: revision.submittedAt?.toISOString() ?? null,
    publishedAt: revision.publishedAt?.toISOString() ?? null,
    version: revision.version,
    updateType: revision.updateType,
    migrationPolicy: revision.migrationPolicy,
  };
}
