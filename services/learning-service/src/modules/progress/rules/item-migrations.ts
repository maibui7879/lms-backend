import type {
  CourseLearningStructure,
  EnrollmentSnapshotData,
  LearningItemData,
} from '@lms/contracts';
import type { CourseItemMigration } from '../entities/course-item-migration.entity';

export interface LearningStructure extends CourseLearningStructure {
  migrations?: CourseItemMigration[];
}

export function itemMigration(
  migrations: CourseItemMigration[],
  itemId: string,
  contentVersion: number,
  policy: CourseItemMigration['policy'],
) {
  return migrations.find(
    (migration) =>
      migration.policy === policy &&
      migration.contentVersion > contentVersion &&
      migration.context.previousItems.some(
        (item) => item.id === itemId && item.contentVersion === contentVersion,
      ),
  );
}

export function applyItemMigrations(
  structure: CourseLearningStructure,
  enrollment: EnrollmentSnapshotData,
  migrations: CourseItemMigration[],
): LearningStructure {
  const result: LearningStructure = structuredClone(structure);
  result.migrations = migrations;
  const replaceAssessment = (
    assessment: {
      quizId: string;
      assessmentVersion: number;
      passingScorePercent: number;
    },
    before: LearningItemData,
    migration: CourseItemMigration,
  ) => {
    if (
      before.type !== 'QUIZ' ||
      !migration.context.requiredAssessment ||
      assessment.quizId !== before.quizId ||
      assessment.assessmentVersion !== before.assessmentVersion
    )
      return assessment;
    return migration.context.requiredAssessment;
  };
  for (const chapter of result.outline.chapters) {
    for (const lesson of chapter.lessons) {
      lesson.items = lesson.items.map((before) => {
        const migration = itemMigration(
          migrations,
          before.id,
          enrollment.contentVersion,
          'REQUIRE_RECOMPLETION',
        );
        if (!migration) return before;
        result.completionPolicy.requiredAssessments =
          result.completionPolicy.requiredAssessments.map((assessment) =>
            replaceAssessment(assessment, before, migration),
          );
        for (const policy of result.completionPolicy.chapterPolicies) {
          policy.requiredAssessments = policy.requiredAssessments.map(
            (assessment) => replaceAssessment(assessment, before, migration),
          );
        }
        return {
          ...migration.context.item,
          id: before.id,
          lessonId: before.lessonId,
          courseId: before.courseId,
          contentVersion: before.contentVersion,
          order: before.order,
          required: before.required,
        };
      });
    }
  }
  return result;
}
