import type { SkillMasteryData } from '@lms/contracts';
import { classifyMastery } from '../../mastery/rules/mastery-level';
import { weakSkills } from './weak-skills';

function mastery(
  skillId: string,
  scorePercent: number,
  questionCount?: number | null,
): SkillMasteryData {
  const evidenceCount = 2;
  return {
    skillId,
    scorePercent,
    evidenceCount,
    questionCount,
    level: classifyMastery({ scorePercent, evidenceCount })!,
  };
}

describe('ADP-01 weak skills', () => {
  it('uses the Mastery level at the threshold and requires five graded questions', () => {
    const rows = [
      mastery('a', 35, 3),
      mastery('b', 35, null),
      mastery('c', 35),
      mastery('d', 35, 5),
      mastery('e', 40, 8),
      mastery('f', 39.999, 8),
      mastery('g', 40 - Number.EPSILON * 100, 8),
    ];
    expect(
      weakSkills(rows, new Set(rows.map(({ skillId }) => skillId))),
    ).toEqual([rows[3], rows[5]]);
  });

  it('filters inactive skills and sorts active skills by score and then ID', () => {
    const rows = [
      mastery('b', 35, 8),
      mastery('a', 35, 8),
      mastery('d', 20, 8),
      mastery('c', 30, 8),
    ];
    expect(weakSkills(rows, new Set(['a', 'b', 'c']))).toEqual([
      rows[3],
      rows[1],
      rows[0],
    ]);
    expect(rows[0].skillId).toBe('b');
    expect(weakSkills([], new Set(['a']))).toEqual([]);
  });
});
