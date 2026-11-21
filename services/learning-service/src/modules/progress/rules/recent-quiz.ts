import type {
  GradedAssessmentSummary,
  LearningRecentQuiz,
} from '@lms/contracts';

export function recentQuiz({
  attemptId,
  courseId,
  quizId,
  assessmentVersion,
  score,
  maxScore,
  passed,
  gradedAt,
}: GradedAssessmentSummary): LearningRecentQuiz {
  return {
    attemptId,
    courseId,
    quizId,
    assessmentVersion,
    scorePercent: (score / maxScore) * 100,
    passed,
    gradedAt,
  };
}

export function sortRecentQuizzes(
  a: LearningRecentQuiz,
  b: LearningRecentQuiz,
) {
  return (
    Date.parse(b.gradedAt) - Date.parse(a.gradedAt) ||
    a.attemptId.localeCompare(b.attemptId) ||
    a.assessmentVersion - b.assessmentVersion
  );
}
