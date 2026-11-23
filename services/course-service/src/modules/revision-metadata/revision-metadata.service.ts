import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import type {
  AuthUser,
  CourseItemMigrationContext,
  PageQuery,
} from '@lms/contracts';
import { Course } from '../courses/entities/course.entity';
import { CourseRevision } from '../course-revisions/entities/course-revision.entity';
import { revisionData } from '../course-revisions/course-revisions.service';
import { LearningItem } from '../learning-items/entities/learning-item.entity';
import { learningItemData } from '../learning-items/learning-items.service';
import { Enrollment } from '../enrollments/entities/enrollment.entity';
import { CompletionPolicy } from '../completion-policy/entities/completion-policy.entity';
import {
  CoursePatchNotice,
  CoursePatchNoticeRead,
  CourseRevisionChange,
} from './entities';

@Injectable()
export class RevisionMetadataService {
  constructor(private readonly db: DataSource) {}

  private async authorize(courseId: string, user: AuthUser, ownerOnly = false) {
    const course = await this.db
      .getRepository(Course)
      .findOneBy({ id: courseId });
    if (!course) throw new NotFoundException('Course not found');
    if (user.status !== 'ACTIVE')
      throw new ForbiddenException('Active account required');
    if (
      user.role === 'ADMIN' ||
      (user.role === 'INSTRUCTOR' && course.instructorId === user.id)
    )
      return;
    if (
      !ownerOnly &&
      user.role === 'STUDENT' &&
      (await this.db.getRepository(Enrollment).findOneBy({
        courseId,
        userId: user.id,
        status: In(['ACTIVE', 'COMPLETED']),
      }))
    )
      return;
    throw new ForbiddenException('Course access required');
  }

  async changes(id: string, query: PageQuery, user: AuthUser) {
    const revision = await this.db
      .getRepository(CourseRevision)
      .findOneBy({ id });
    if (!revision) throw new NotFoundException('Revision not found');
    await this.authorize(revision.courseId, user, true);
    const page = query.page ?? 1,
      limit = query.limit ?? 20;
    const [rows, total] = await this.db
      .getRepository(CourseRevisionChange)
      .findAndCount({
        where: { revisionId: id },
        order: { createdAt: 'DESC', id: 'ASC' },
        skip: (page - 1) * limit,
        take: limit,
      });
    return {
      items: rows.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
      })),
      page,
      limit,
      total,
    };
  }

  async notices(courseId: string, query: PageQuery, user: AuthUser) {
    await this.authorize(courseId, user);
    const page = query.page ?? 1,
      limit = query.limit ?? 20;
    const [rows, total] = await this.db
      .getRepository(CoursePatchNotice)
      .findAndCount({
        where: { courseId },
        order: { publishedAt: 'DESC', id: 'ASC' },
        skip: (page - 1) * limit,
        take: limit,
      });
    return {
      items: rows.map((row) => ({
        ...row,
        publishedAt: row.publishedAt.toISOString(),
      })),
      page,
      limit,
      total,
    };
  }

  async read(id: string, user: AuthUser) {
    const notice = await this.db
      .getRepository(CoursePatchNotice)
      .findOneBy({ id });
    if (!notice) throw new NotFoundException('Notice not found');
    await this.authorize(notice.courseId, user);
    await this.db
      .getRepository(CoursePatchNoticeRead)
      .createQueryBuilder()
      .insert()
      .values({ noticeId: id, userId: user.id })
      .orIgnore()
      .execute();
  }

  async context(id: string): Promise<CourseItemMigrationContext> {
    return this.db.transaction('REPEATABLE READ', async (manager) => {
      const revision = await manager.findOneBy(CourseRevision, {
        id,
        status: 'PUBLISHED',
      });
      if (
        !revision ||
        revision.contentVersion === null ||
        !revision.publishedAt
      )
        throw new NotFoundException('Published revision not found');
      const items = await manager.find(LearningItem, {
        where: { revisionId: id, courseId: revision.courseId },
        order: { id: 'ASC' },
      });
      const policy = await manager.findOneBy(CompletionPolicy, {
        courseId: revision.courseId,
        contentVersion: revision.contentVersion,
      });
      if (!policy)
        throw new ConflictException('Published completion policy unavailable');
      const assessments = [
        ...policy.requiredAssessments,
        ...policy.chapterPolicies.flatMap(
          (chapter) => chapter.requiredAssessments,
        ),
      ];
      const result: CourseItemMigrationContext['items'] = [];
      for (const item of items) {
        if (item.contentVersion !== revision.contentVersion)
          throw new ConflictException('Target item snapshot version mismatch');
        const previousItems: CourseItemMigrationContext['items'][number]['previousItems'] =
          [];
        const seen = new Set([item.id]);
        let target = item;
        while (true) {
          if (!target.revisionId) break;
          const targetRevision =
            target.revisionId === revision.id
              ? revision
              : await manager.findOneBy(CourseRevision, {
                  id: target.revisionId,
                  courseId: revision.courseId,
                  status: 'PUBLISHED',
                });
          if (!targetRevision || !targetRevision.sourceItemIds)
            throw new ConflictException('Item lineage unavailable');
          const sourceItemId = targetRevision.sourceItemIds[target.id];
          if (!sourceItemId) break;
          if (seen.has(sourceItemId))
            throw new ConflictException('Invalid item lineage');
          const source = await manager.findOneBy(LearningItem, {
            id: sourceItemId,
            courseId: revision.courseId,
          });
          if (
            !source ||
            source.contentVersion !== targetRevision.baseContentVersion ||
            source.contentVersion >= target.contentVersion
          )
            throw new ConflictException('Invalid item lineage source');
          if (source.revisionId) {
            const published = await manager.findOneBy(CourseRevision, {
              id: source.revisionId,
              courseId: revision.courseId,
              status: 'PUBLISHED',
              contentVersion: source.contentVersion,
            });
            if (!published)
              throw new ConflictException('Unpublished item lineage source');
          } else {
            const course = await manager.findOneBy(Course, {
              id: revision.courseId,
            });
            if (
              source.contentVersion !== course?.initialPublishedContentVersion
            )
              throw new ConflictException('Unverified initial item snapshot');
          }
          seen.add(source.id);
          previousItems.push(learningItemData(source));
          target = source;
        }
        result.push({
          item: learningItemData(item),
          previousItems,
          requiredAssessment:
            assessments.find(
              (a) =>
                a.quizId === item.quizId &&
                a.assessmentVersion === item.assessmentVersion,
            ) ?? null,
        });
      }
      return { revision: revisionData(revision), items: result };
    });
  }
}
