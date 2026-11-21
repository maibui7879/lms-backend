import { Injectable } from '@nestjs/common';
import type { MigrateCourseItemsRequest } from '@lms/contracts';
import { apiError } from '../../../common/api-error';
import { CourseClient } from '../../../integrations/course.client';
import { CourseItemMigrationsRepository } from '../repositories/course-item-migrations.repository';

@Injectable()
export class CourseItemsMigrationService {
  constructor(
    private readonly course: CourseClient,
    private readonly migrations: CourseItemMigrationsRepository,
  ) {}

  async apply(
    courseId: string,
    input: MigrateCourseItemsRequest,
    requestId: string,
  ) {
    const body = {
      ...input,
      revisionId: input.revisionId.toLowerCase(),
      itemIds: input.itemIds.map((id) => id.toLowerCase()),
    };
    if (
      !body.itemIds.length ||
      new Set(body.itemIds).size !== body.itemIds.length
    )
      throw apiError(
        'VALIDATION_ERROR',
        'Provide a non-empty list of unique item IDs',
      );
    const context = await this.course.migrationContext(
      body.revisionId,
      requestId,
    );
    const { revision, items } = context;
    if (revision.id !== body.revisionId || revision.courseId !== courseId)
      throw apiError(
        'INVALID_LESSON_RELATION',
        'Revision does not belong to the course',
      );
    if (
      revision.status !== 'PUBLISHED' ||
      revision.contentVersion === null ||
      revision.contentVersion <= revision.baseContentVersion
    )
      throw apiError(
        'REVISION_CONFLICT',
        'Migration requires a published revision',
      );
    if (
      body.policy === 'REQUIRE_RECOMPLETION' &&
      (revision.updateType !== 'CRITICAL' ||
        revision.migrationPolicy !== 'MIGRATE_AFFECTED_ITEMS')
    )
      throw apiError(
        'REVISION_CONFLICT',
        'Revision does not require recompletion',
      );
    for (const itemId of body.itemIds) {
      const row = items.find(({ item }) => item.id === itemId);
      if (
        !row ||
        row.item.courseId !== courseId ||
        row.item.revisionId !== revision.id ||
        row.item.contentVersion !== revision.contentVersion
      )
        throw apiError(
          'INVALID_LESSON_RELATION',
          'Item does not belong to the published revision',
        );
      const assessment = row.requiredAssessment;
      if (
        assessment &&
        (row.item.type !== 'QUIZ' ||
          assessment.quizId !== row.item.quizId ||
          assessment.assessmentVersion !== row.item.assessmentVersion)
      )
        throw apiError(
          'SERVICE_UNAVAILABLE',
          'Course returned an inconsistent quiz requirement',
        );
      for (const previous of row.previousItems) {
        if (
          previous.courseId !== courseId ||
          previous.contentVersion >= revision.contentVersion
        )
          throw apiError(
            'INVALID_LESSON_RELATION',
            'Item lineage belongs to another course or version',
          );
        if (
          previous.type === 'QUIZ' &&
          row.item.type === 'QUIZ' &&
          previous.quizId === row.item.quizId &&
          row.item.assessmentVersion <= previous.assessmentVersion
        )
          throw apiError(
            'REVISION_CONFLICT',
            'A changed quiz requires a new assessmentVersion',
          );
      }
    }
    await this.migrations.apply(courseId, body, context);
  }
}
