import type {
  CourseLearningStructure,
  GradedAssessmentSummary,
  ItemProgressData,
  LessonOutline,
  RequiredAssessment,
} from '@lms/contracts';
import type { AssessmentAttempt } from '../../progress-sync/entities/assessment-attempt.entity';
import type { ItemCompletion } from '../entities/item-completion.entity';
import { itemMigration } from './item-migrations';
import type { LearningStructure } from './item-migrations';

function assessmentKey({
  quizId,
  assessmentVersion,
}: Pick<RequiredAssessment, 'quizId' | 'assessmentVersion'>): string {
  return `${quizId}:${assessmentVersion}`;
}

export function progressEvidence(
  { outline, completionPolicy, migrations = [] }: LearningStructure,
  completions: ItemCompletion[],
  attempts: AssessmentAttempt[],
) {
  const items = outline.chapters.flatMap(({ lessons }) =>
    lessons.flatMap(({ items }) => items),
  );
  const quizItems = items.filter((item) => item.type === 'QUIZ');
  const requiredAssessments = [
    ...completionPolicy.requiredAssessments,
    ...completionPolicy.chapterPolicies.flatMap(
      ({ requiredAssessments }) => requiredAssessments,
    ),
    ...items.flatMap((item) => {
      const assessment = itemMigration(
        migrations,
        item.id,
        outline.contentVersion,
        'REQUIRE_RECOMPLETION',
      )?.context.requiredAssessment;
      return assessment ? [assessment] : [];
    }),
  ];
  const assessmentKeys = new Set(
    [...quizItems, ...requiredAssessments].map(assessmentKey),
  );
  const attemptsByQuiz = new Map<string, AssessmentAttempt[]>();
  const relevantAttempts = attempts.filter(({ result }) =>
    assessmentKeys.has(assessmentKey(result)),
  );
  for (const attempt of relevantAttempts) {
    const key = assessmentKey(attempt.result);
    const matching = attemptsByQuiz.get(key) ?? [];
    matching.push(attempt);
    attemptsByQuiz.set(key, matching);
  }
  const invalidatedSince = new Map<string, Date>();
  const invalidatedGenerations = new Map<string, number>();
  for (const item of items) {
    const migration = itemMigration(
      migrations,
      item.id,
      outline.contentVersion,
      'REQUIRE_RECOMPLETION',
    );
    if (!migration) continue;
    invalidatedSince.set(item.id, migration.appliedAt);
    invalidatedGenerations.set(item.id, migration.generation);
  }

  function firstMatch(
    assessment: Pick<RequiredAssessment, 'quizId' | 'assessmentVersion'>,
    accepts: (result: GradedAssessmentSummary) => boolean,
  ): Date | undefined {
    let first: Date | undefined;
    for (const { result, gradedAt } of attemptsByQuiz.get(
      assessmentKey(assessment),
    ) ?? []) {
      if (accepts(result) && (!first || gradedAt < first)) first = gradedAt;
    }
    return first;
  }

  const itemStates = new Map<string, ItemProgressData>();
  const completedItems = new Map<string, Date>();
  for (const item of items) {
    const completion = completions.find(
      ({ learningItemId }) => learningItemId === item.id,
    );
    const migration = itemMigration(
      migrations,
      item.id,
      outline.contentVersion,
      'REQUIRE_RECOMPLETION',
    );
    const notification = itemMigration(
      migrations,
      item.id,
      outline.contentVersion,
      'NOTIFY_ONLY',
    );
    const notificationReason =
      notification &&
      (completion?.migrationCount ?? 0) < notification.generation
        ? notification.reason
        : null;
    const state: ItemProgressData = {
      learningItemId: item.id,
      contentVersion: outline.contentVersion,
      status: completion?.status ?? (completion ? 'COMPLETED' : 'NOT_STARTED'),
      completedAt: completion?.completedAt.toISOString() ?? null,
      invalidatedAt: completion?.invalidatedAt?.toISOString() ?? null,
      invalidationReason: completion?.invalidationReason ?? notificationReason,
    };
    if (
      migration &&
      (!completion ||
        (completion.migrationCount ?? 0) < migration.generation ||
        ['OUTDATED', 'RESET'].includes(state.status))
    ) {
      state.status = completion?.status === 'RESET' ? 'RESET' : 'OUTDATED';
      state.invalidatedAt = migration.appliedAt.toISOString();
      state.invalidationReason = migration.reason;
    }
    if (state.status === 'COMPLETED' && completion)
      completedItems.set(item.id, completion.completedAt);
    itemStates.set(item.id, state);
  }
  for (const item of quizItems) {
    const policies = requiredAssessments.filter(
      (assessment) => assessmentKey(assessment) === assessmentKey(item),
    );
    const accepts = ({
      quizType,
      passed,
      passingScorePercent,
    }: GradedAssessmentSummary) =>
      policies.length
        ? quizType === 'GRADED' &&
          passed &&
          policies.every(
            (policy) => policy.passingScorePercent === passingScorePercent,
          )
        : quizType === 'PRACTICE' || passed;
    const completedAt = firstMatch(item, accepts);
    if (completedAt) {
      const notification = itemMigration(
        migrations,
        item.id,
        outline.contentVersion,
        'NOTIFY_ONLY',
      );
      const migration = itemMigration(
        migrations,
        item.id,
        outline.contentVersion,
        'REQUIRE_RECOMPLETION',
      );
      const notificationApplies =
        notification &&
        (!migration ||
          notification.contentVersion > migration.contentVersion ||
          (notification.contentVersion === migration.contentVersion &&
            notification.generation > migration.generation));
      const acknowledged =
        notification &&
        firstMatch(
          item,
          (result) =>
            accepts(result) &&
            Date.parse(result.gradedAt) > notification.appliedAt.getTime(),
        );
      completedItems.set(item.id, completedAt);
      itemStates.set(item.id, {
        learningItemId: item.id,
        contentVersion: outline.contentVersion,
        status: 'COMPLETED',
        completedAt: completedAt.toISOString(),
        invalidatedAt: null,
        invalidationReason:
          notificationApplies && !acknowledged ? notification.reason : null,
      });
    }
  }

  return {
    completedItems,
    itemStates,
    invalidatedSince,
    invalidatedGenerations,
    requiredItemIds: requiredLessonItemIds(completionPolicy),
    migrationCount: migrations.length,
    attempts: relevantAttempts,
    passedAt: (assessment: RequiredAssessment) =>
      firstMatch(
        assessment,
        (result) =>
          result.quizType === 'GRADED' &&
          result.passed &&
          result.passingScorePercent === assessment.passingScorePercent,
      ),
    activityTimes: [
      ...completions.map(({ completedAt }) => completedAt),
      ...relevantAttempts.map(({ gradedAt }) => gradedAt),
      ...invalidatedSince.values(),
    ],
  };
}

export type ProgressEvidence = ReturnType<typeof progressEvidence>;

export function lessonInvalidatedAt(
  lesson: LessonOutline,
  evidence: ProgressEvidence,
): Date | undefined {
  const dates = lesson.items
    .filter(({ id }) => evidence.requiredItemIds.has(id))
    .map(({ id }) => evidence.invalidatedSince.get(id))
    .filter((date): date is Date => date !== undefined);
  return dates.length
    ? new Date(Math.max(...dates.map((date) => date.getTime())))
    : undefined;
}

export function lessonCompletionValid(
  lesson: LessonOutline,
  completedAt: Date | undefined,
  evidence: ProgressEvidence,
  migrationCount = 0,
): boolean {
  if (!completedAt) return false;
  const requiredGeneration = lessonMigrationGeneration(lesson, evidence);
  return (
    migrationCount >= requiredGeneration &&
    lesson.items.every(
      ({ id }) =>
        !evidence.requiredItemIds.has(id) || evidence.completedItems.has(id),
    )
  );
}

export function lessonMigrationGeneration(
  lesson: LessonOutline,
  evidence: ProgressEvidence,
): number {
  return Math.max(
    0,
    ...lesson.items
      .filter(({ id }) => evidence.requiredItemIds.has(id))
      .map(({ id }) => evidence.invalidatedGenerations.get(id) ?? 0),
  );
}

export function requiredLessonItemIds({
  requiredItemIds,
  chapterPolicies,
}: CourseLearningStructure['completionPolicy']): Set<string> {
  return new Set([
    ...requiredItemIds,
    ...chapterPolicies.flatMap((chapter) => chapter.requiredItemIds),
  ]);
}
