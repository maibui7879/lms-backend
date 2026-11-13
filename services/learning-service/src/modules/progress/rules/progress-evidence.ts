import type {
  CourseLearningStructure,
  GradedAssessmentSummary,
  RequiredAssessment,
} from '@lms/contracts';
import type { AssessmentAttempt } from '../../progress-sync/entities/assessment-attempt.entity';
import type { ItemCompletion } from '../entities/item-completion.entity';

function assessmentKey({
  quizId,
  assessmentVersion,
}: Pick<RequiredAssessment, 'quizId' | 'assessmentVersion'>): string {
  return `${quizId}:${assessmentVersion}`;
}

export function progressEvidence(
  { outline, completionPolicy }: CourseLearningStructure,
  completions: ItemCompletion[],
  attempts: AssessmentAttempt[],
) {
  const quizItems = outline.chapters.flatMap(({ lessons }) =>
    lessons.flatMap(({ items }) =>
      items.filter((item) => item.type === 'QUIZ'),
    ),
  );
  const assessmentKeys = new Set(
    [
      ...quizItems,
      ...completionPolicy.requiredAssessments,
      ...completionPolicy.chapterPolicies.flatMap(
        ({ requiredAssessments }) => requiredAssessments,
      ),
    ].map(assessmentKey),
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

  const completedItems = new Map(
    completions.map(({ learningItemId, completedAt }) => [
      learningItemId,
      completedAt,
    ]),
  );
  for (const item of quizItems) {
    const completedAt = firstMatch(
      item,
      ({ quizType, passed }) => quizType === 'PRACTICE' || passed,
    );
    if (completedAt) completedItems.set(item.id, completedAt);
  }

  return {
    completedItems,
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
    ],
  };
}

export type ProgressEvidence = ReturnType<typeof progressEvidence>;
