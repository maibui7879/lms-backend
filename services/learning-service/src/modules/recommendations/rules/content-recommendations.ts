import type {
  LearningItemData,
  LessonOutline,
  QuizRecommendationContext,
} from '@lms/contracts';
import type {
  RecommendationCandidate,
  RecommendationTarget,
} from './rank-recommendations';

const percent = new Intl.NumberFormat('vi-VN', {
  maximumFractionDigits: 2,
  roundingMode: 'trunc',
});

function matchedSkill(
  skillIds: readonly string[],
  targets: readonly RecommendationTarget[],
) {
  const linked = new Set(skillIds.map((id) => id.toLowerCase()));
  return targets.find(({ skillId }) => linked.has(skillId));
}

function evidenceText(skill: RecommendationTarget) {
  const name = skill.skillName ?? skill.skillId;
  const text =
    skill.prerequisiteFor !== undefined
      ? `Củng cố kỹ năng ${name} trước khi ôn ${skill.prerequisiteFor}.`
      : `Kỹ năng ${name} đạt ${percent.format(skill.scorePercent)}% từ ${skill.questionCount} câu đã chấm.`;
  const trend = skill.trend ?? 0;
  return Math.abs(trend) < 0.01
    ? text
    : `${text} Điểm hai lượt gần nhất ${trend < 0 ? 'giảm' : 'tăng'} ${percent.format(Math.abs(trend))} điểm phần trăm so với hai lượt trước.`;
}

export function lessonRecommendations(
  courseId: string,
  accessibleLessons: readonly Pick<
    LessonOutline,
    'id' | 'title' | 'skillIds'
  >[],
  targets: readonly RecommendationTarget[],
  lessonOrders: ReadonlyMap<string, number>,
): RecommendationCandidate[] {
  return accessibleLessons.flatMap(({ id, title, skillIds }) => {
    const skill = matchedSkill(skillIds ?? [], targets);
    if (!skill) return [];
    return [
      {
        data: {
          courseId,
          lessonId: id,
          learningItemId: null,
          reason: skill.prerequisiteFor ? 'SKILL_PREREQUISITE' : 'LOW_MASTERY',
          explanation: `${evidenceText(skill)} Ôn bài ${title}.`,
        },
        target: skill,
        lessonOrder: lessonOrders.get(id) ?? 0,
        itemOrder: -1,
      },
    ];
  });
}

export function quizRecommendation(
  item: Pick<
    LearningItemData,
    'courseId' | 'lessonId' | 'id' | 'title' | 'order'
  >,
  context: QuizRecommendationContext | null,
  targets: readonly RecommendationTarget[],
  lessonOrders: ReadonlyMap<string, number>,
): RecommendationCandidate | null {
  if (
    context?.quizType !== 'PRACTICE' ||
    !context.canStart ||
    context.attemptsRemaining < 1
  )
    return null;
  const skill = matchedSkill(context.skillIds, targets);
  if (!skill) return null;
  return {
    data: {
      courseId: item.courseId,
      lessonId: item.lessonId,
      learningItemId: item.id,
      reason: skill.prerequisiteFor ? 'SKILL_PREREQUISITE' : 'LOW_MASTERY',
      explanation: `${evidenceText(skill)} Làm “${item.title}”. Còn ${context.attemptsRemaining} lượt.`,
    },
    target: skill,
    lessonOrder: lessonOrders.get(item.lessonId) ?? 0,
    itemOrder: item.order,
  };
}
