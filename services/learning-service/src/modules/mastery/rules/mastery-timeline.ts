import type {
  CourseLearningStructure,
  EnrollmentSnapshotData,
  RequiredAssessment,
} from '@lms/contracts';
import type { CourseItemMigration } from '../../progress/entities/course-item-migration.entity';
import { applyItemMigrations } from '../../progress/rules/item-migrations';
import type { AssessmentAttempt } from '../../progress-sync/entities/assessment-attempt.entity';

type AssessmentReference = Pick<
  RequiredAssessment,
  'quizId' | 'assessmentVersion'
>;

function assessmentKey({
  quizId,
  assessmentVersion,
}: AssessmentReference): string {
  return `${quizId.toLowerCase()}:${assessmentVersion}`;
}

function assessmentScope({
  outline,
  completionPolicy,
}: CourseLearningStructure) {
  const quizzes = outline.chapters.flatMap(({ lessons }) =>
    lessons.flatMap(({ items }) =>
      items.filter((item) => item.type === 'QUIZ'),
    ),
  );
  return new Set(
    [
      ...quizzes,
      ...completionPolicy.requiredAssessments,
      ...completionPolicy.chapterPolicies.flatMap(
        ({ requiredAssessments }) => requiredAssessments,
      ),
    ].map(assessmentKey),
  );
}

export function masteryTimeline(
  enrollment: EnrollmentSnapshotData,
  pinnedStructure: CourseLearningStructure,
  migrations: CourseItemMigration[],
  attempts: AssessmentAttempt[],
) {
  const enrolledAt = Date.parse(enrollment.enrolledAt);
  const relevantMigrations = migrations.filter(
    (migration) =>
      migration.policy === 'REQUIRE_RECOMPLETION' &&
      migration.contentVersion > enrollment.contentVersion &&
      migration.context.previousItems.some(
        ({ contentVersion }) => contentVersion === enrollment.contentVersion,
      ),
  );
  const scopeAt = (at: number) =>
    assessmentScope(
      applyItemMigrations(
        pinnedStructure,
        enrollment,
        relevantMigrations.filter(({ appliedAt }) => appliedAt.getTime() <= at),
      ),
    );
  const changes = [
    ...new Set([
      enrolledAt,
      ...relevantMigrations
        .map(({ appliedAt }) => appliedAt.getTime())
        .filter((at) => at > enrolledAt),
    ]),
  ].sort((a, b) => a - b);
  const scopes = changes.map((at) => ({ at, keys: scopeAt(at) }));
  const currentScope = scopes.at(-1)!;

  const results = attempts
    .flatMap(({ result, gradedAt }) => {
      const gradeTime = gradedAt.getTime();
      if (result.quizType !== 'GRADED' || gradeTime < enrolledAt) return [];
      const key = assessmentKey(result);
      // A new version's grade may reach Learning before its migration notice.
      const index = scopes.findIndex(
        ({ keys }, index) =>
          keys.has(key) && (scopes[index + 1]?.at ?? Infinity) > gradeTime,
      );
      if (index === -1) return [];
      const scope = scopes[index];
      return [
        { result, key, scope, effectiveAt: Math.max(gradeTime, scope.at) },
      ];
    })
    .sort(
      (a, b) =>
        a.effectiveAt - b.effectiveAt ||
        Date.parse(a.result.gradedAt) - Date.parse(b.result.gradedAt) ||
        a.result.attemptId.localeCompare(b.result.attemptId) ||
        a.result.assessmentVersion - b.result.assessmentVersion,
    );

  return { currentScope, results };
}
