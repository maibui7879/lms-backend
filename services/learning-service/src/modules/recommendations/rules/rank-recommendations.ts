import type { RecommendationData } from '@lms/contracts';
import type { SkillEvidenceScore } from '../../mastery/rules/weighted-score';

interface TargetSkill {
  skillId: string;
  skillName?: string;
  trend?: number;
}

export type RecommendationTarget = TargetSkill &
  (
    | { scorePercent: number; questionCount: number; prerequisiteFor?: never }
    | {
        scorePercent?: number;
        questionCount?: number | null;
        prerequisiteFor: string;
      }
  );

export interface RecommendationCandidate {
  data: RecommendationData;
  target: RecommendationTarget;
  lessonOrder: number;
  itemOrder: number;
}

const recentWindow = 30 * 24 * 60 * 60 * 1000;

export function masteryTrends(
  history: readonly {
    effectiveAt: number;
    gradedAt: string;
    attemptId: string;
    assessmentVersion: number;
    scores: readonly (SkillEvidenceScore & { skillId: string })[];
  }[],
  now: number,
  scorePercent: (scores: readonly SkillEvidenceScore[]) => number,
) {
  const recent = new Map<string, SkillEvidenceScore[]>();
  const ordered = history
    .filter(
      ({ effectiveAt }) =>
        effectiveAt >= now - recentWindow && effectiveAt <= now,
    )
    .sort(
      (a, b) =>
        b.effectiveAt - a.effectiveAt ||
        Date.parse(b.gradedAt) - Date.parse(a.gradedAt) ||
        b.attemptId.localeCompare(a.attemptId) ||
        b.assessmentVersion - a.assessmentVersion,
    );
  for (const { scores } of ordered) {
    for (const score of scores) {
      const existing = recent.get(score.skillId) ?? [];
      if (existing.length < 4) existing.push(score);
      recent.set(score.skillId, existing);
    }
  }
  const trends = new Map<string, number>();
  for (const [skillId, scores] of recent) {
    if (scores.length === 4)
      trends.set(
        skillId,
        scorePercent(scores.slice(0, 2)) - scorePercent(scores.slice(2)),
      );
  }
  return trends;
}

function compareTargets(a: RecommendationTarget, b: RecommendationTarget) {
  const score = (target: RecommendationTarget) => target.scorePercent ?? 0;
  const priority = (target: RecommendationTarget) =>
    score(target) + Math.max(-5, Math.min(5, target.trend ?? 0));
  return (
    Number(Boolean(b.prerequisiteFor)) - Number(Boolean(a.prerequisiteFor)) ||
    priority(a) - priority(b) ||
    score(a) - score(b)
  );
}

export function rankTargets(targets: readonly RecommendationTarget[]) {
  return targets.toSorted(
    (a, b) => compareTargets(a, b) || a.skillId.localeCompare(b.skillId),
  );
}

export function rankRecommendations(
  candidates: readonly RecommendationCandidate[],
) {
  const sorted = candidates.toSorted(
    (a, b) =>
      compareTargets(a.target, b.target) ||
      a.data.courseId.localeCompare(b.data.courseId) ||
      a.lessonOrder - b.lessonOrder ||
      a.itemOrder - b.itemOrder ||
      a.data.lessonId.localeCompare(b.data.lessonId) ||
      (a.data.learningItemId ?? '').localeCompare(b.data.learningItemId ?? ''),
  );
  const seen = new Set<string>();
  return sorted.flatMap(({ data }) => {
    const key = `${data.courseId}:${data.lessonId}:${data.learningItemId ?? ''}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [data];
  });
}
