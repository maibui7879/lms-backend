import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type {
  AuthUser,
  CreateDiscussionRequest,
  DiscussionData,
  PageQuery,
  PinDiscussionRequest,
  UpdateDiscussionRequest,
  VersionRequest,
} from '@lms/contracts';
import { DataSource, In } from 'typeorm';
import type { EntityManager } from 'typeorm';
import { Course } from '../courses/entities/course.entity';
import { Enrollment } from '../enrollments/entities/enrollment.entity';
import { Lesson } from '../lessons/entities/lesson.entity';
import { Discussion } from './discussion.entity';
import { CourseRevision } from '../course-revisions/entities/course-revision.entity';

@Injectable()
export class DiscussionsService {
  constructor(private readonly db: DataSource) {}

  private async access(
    manager: EntityManager,
    courseId: string,
    user: AuthUser,
  ) {
    if (user.status !== 'ACTIVE')
      throw new ForbiddenException('Active account required');
    const course = await manager.findOneBy(Course, { id: courseId });
    if (!course) throw new NotFoundException('Course not found');
    const owner =
      user.role === 'ADMIN' ||
      (user.role === 'INSTRUCTOR' && course.instructorId === user.id);
    if (owner) return { owner, contentVersion: course.contentVersion };
    const enrollment =
      user.role === 'STUDENT'
        ? await manager.findOneBy(Enrollment, {
            courseId,
            userId: user.id,
            status: In(['ACTIVE', 'COMPLETED']),
          })
        : null;
    if (!enrollment) throw new ForbiddenException('Enrollment required');
    return { owner, contentVersion: enrollment.contentVersion };
  }

  async list(courseId: string, query: PageQuery, user: AuthUser) {
    await this.access(this.db.manager, courseId, user);
    const page = query.page ?? 1,
      limit = query.limit ?? 20;
    const [rows, total] = await this.db.manager.findAndCount(Discussion, {
      where: { courseId },
      order: { createdAt: 'DESC', id: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items: rows.map(discussionData), page, limit, total };
  }

  async create(
    courseId: string,
    input: CreateDiscussionRequest,
    user: AuthUser,
  ) {
    return this.db.transaction(async (manager) => {
      const access = await this.access(manager, courseId, user);
      const lessonId = input.lessonId ?? null;
      if (lessonId) {
        const lesson = await manager.findOneBy(Lesson, {
          id: lessonId,
          courseId,
        });
        if (!lesson)
          throw new UnprocessableEntityException({
            code: 'INVALID_LESSON_RELATION',
            message: 'Lesson must belong to this course',
          });
        // A learner can discuss only a lesson in their pinned published snapshot.
        if (!access.owner && lesson.revisionId) {
          const revision = await manager.findOneBy(CourseRevision, {
            id: lesson.revisionId,
            courseId,
            status: 'PUBLISHED',
            contentVersion: access.contentVersion,
          });
          if (!revision)
            throw new ForbiddenException(
              'Lesson is outside enrolled content version',
            );
        } else if (!access.owner) {
          const course = await manager.findOneByOrFail(Course, {
            id: courseId,
          });
          if (access.contentVersion !== course.initialPublishedContentVersion)
            throw new ForbiddenException(
              'Lesson is outside enrolled content version',
            );
        }
      }
      if (input.parentId) {
        const parent = await manager.findOne(Discussion, {
          where: { id: input.parentId },
          lock: { mode: 'pessimistic_write' },
        });
        if (
          !parent ||
          parent.courseId !== courseId ||
          parent.lessonId !== lessonId ||
          parent.parentId !== null
        )
          throw new UnprocessableEntityException({
            code: 'INVALID_LESSON_RELATION',
            message:
              'Parent must be a root discussion in the same course and lesson',
          });
      }
      return discussionData(
        await manager.save(
          Discussion,
          manager.create(Discussion, {
            courseId,
            lessonId,
            parentId: input.parentId ?? null,
            authorId: user.id,
            body: cleanBody(input.body),
            pinned: false,
            version: 1,
          }),
        ),
      );
    });
  }

  async mutate(
    id: string,
    input: UpdateDiscussionRequest | PinDiscussionRequest | VersionRequest,
    user: AuthUser,
    operation: 'update' | 'pin' | 'delete',
  ) {
    return this.db.transaction(async (manager) => {
      const row = await manager.findOne(Discussion, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!row) throw new NotFoundException('Discussion not found');
      const { owner } = await this.access(manager, row.courseId, user);
      if (
        operation === 'pin'
          ? !owner
          : operation === 'update'
            ? row.authorId !== user.id && user.role !== 'ADMIN'
            : row.authorId !== user.id && !owner
      )
        throw new ForbiddenException('Discussion permission required');
      if (row.version !== input.expectedVersion)
        throw new ConflictException({
          code: 'VERSION_CONFLICT',
          message: 'Discussion was changed',
          details: {
            expectedVersion: input.expectedVersion,
            currentVersion: row.version,
          },
        });
      if (operation === 'delete') {
        await manager.delete(Discussion, { parentId: id });
        await manager.delete(Discussion, { id });
        return;
      }
      if (operation === 'pin')
        row.pinned = (input as PinDiscussionRequest).pinned;
      else row.body = cleanBody((input as UpdateDiscussionRequest).body);
      row.version += 1;
      return discussionData(await manager.save(Discussion, row));
    });
  }
}

// Store plain text; clients must render as text rather than interpret markup.
function cleanBody(body: string): string {
  return body.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
export function discussionData(row: Discussion): DiscussionData {
  return {
    id: row.id,
    courseId: row.courseId,
    lessonId: row.lessonId,
    parentId: row.parentId,
    authorId: row.authorId,
    body: row.body,
    pinned: row.pinned,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
