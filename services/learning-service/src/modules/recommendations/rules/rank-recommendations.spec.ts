import type { SkillMasteryData } from '@lms/contracts';
import { weightedScorePercent } from '../../mastery/rules/weighted-score';
import { recommendationTargets } from './prerequisite-graph';
import { masteryTrends, rankRecommendations } from './rank-recommendations';
import type {
  RecommendationCandidate,
  RecommendationTarget,
} from './rank-recommendations';
import type { WeakSkill } from './weak-skills';

const weak: WeakSkill = {
  skillId: 'advanced',
  skillName: 'Nâng cao',
  scorePercent: 30,
  evidenceCount: 2,
  questionCount: 6,
  level: 'BEGINNER',
};

it('ADP-06 follows a chain even if an intermediate skill is already proficient', () => {
  const active = new Map([
    ['advanced', 'Nâng cao'],
    ['middle', 'Trung cấp'],
    ['basic', 'Cơ bản'],
  ]);
  const middle: SkillMasteryData = {
    ...weak,
    skillId: 'middle',
    skillName: 'Trung cấp',
    scorePercent: 75,
    level: 'PROFICIENT',
  };
  const edges = [
    { skillId: 'advanced', prerequisiteSkillId: 'middle' },
    { skillId: 'middle', prerequisiteSkillId: 'basic' },
  ];
  expect(
    recommendationTargets([weak], [weak, middle], active, edges, new Map()),
  ).toMatchObject([{ skillId: 'basic', prerequisiteFor: 'Nâng cao' }]);
  expect(
    recommendationTargets(
      [weak],
      [weak, middle, { ...middle, skillId: 'basic' }],
      active,
      edges,
      new Map(),
    ),
  ).toMatchObject([{ skillId: 'advanced' }]);
});

it('ADP-04 ranks across courses, deduplicates before paging and stabilizes ties', () => {
  const suggestion = (
    courseId: string,
    lessonId: string,
    target: RecommendationTarget,
    lessonOrder = 0,
  ): RecommendationCandidate => ({
    data: {
      courseId,
      lessonId,
      learningItemId: null,
      reason: 'LOW_MASTERY',
      explanation: '',
    },
    target,
    lessonOrder,
    itemOrder: -1,
  });
  const first = suggestion('course-2', 'prerequisite', {
    skillId: 'basic',
    scorePercent: 60,
    prerequisiteFor: 'Nâng cao',
  });
  const falling = suggestion('course-2', 'declining', {
    ...weak,
    scorePercent: 34,
    trend: -42,
  });
  const earlier = suggestion('course-1', 'a', weak);
  const later = suggestion('course-1', 'b', weak, 1);
  const shuffled = [later, earlier, falling, first, earlier];
  const ranked = rankRecommendations(shuffled);
  expect(ranked.map(({ lessonId }) => lessonId)).toEqual([
    'prerequisite',
    'declining',
    'a',
    'b',
  ]);
  expect(rankRecommendations(shuffled.toReversed())).toEqual(ranked);
});

it('ADP-07 compares weighted scores of the two latest versus two earlier valid attempts', () => {
  const now = Date.parse('2026-11-15T12:00:00Z');
  const day = 86400000;
  const row = (age: number, score: number, maxScore: number) => ({
    effectiveAt: now - age * day,
    gradedAt: new Date(now - age * day).toISOString(),
    attemptId: String(age),
    assessmentVersion: 1,
    scores: [{ skillId: weak.skillId, score, maxScore }],
  });
  const old = row(31, 10, 10);
  const fresh = [row(1, 2, 5), row(3, 10, 20), row(2, 3, 15), row(4, 10, 20)];
  expect(
    masteryTrends(
      [old, row(-1, 0, 10), ...fresh.slice(0, 3)],
      now,
      weightedScorePercent,
    ).size,
  ).toBe(0);
  expect(
    masteryTrends([old, ...fresh], now, weightedScorePercent).get(weak.skillId),
  ).toBe(-25);
  const improving = [
    row(1, 18, 20),
    row(2, 18, 20),
    row(3, 10, 20),
    row(4, 10, 20),
  ];
  expect(
    masteryTrends(improving, now, weightedScorePercent).get(weak.skillId),
  ).toBe(40);
});

it('ADP-07 resolves grades with the same effective time by grading chronology', () => {
  const now = Date.parse('2026-11-15T12:00:00Z');
  const history = [11, 11, 2.6, 2.6].map((score, index) => ({
    effectiveAt: now,
    gradedAt: new Date(now - (4 - index) * 60000).toISOString(),
    attemptId: String(index),
    assessmentVersion: 2,
    scores: [{ skillId: weak.skillId, score, maxScore: 20 }],
  }));
  expect(
    masteryTrends(history, now, weightedScorePercent).get(weak.skillId),
  ).toBeCloseTo(-42);
  expect(
    masteryTrends(history.toReversed(), now, weightedScorePercent),
  ).toEqual(masteryTrends(history, now, weightedScorePercent));
});
