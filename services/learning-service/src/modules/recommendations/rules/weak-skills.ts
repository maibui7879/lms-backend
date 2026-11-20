import type { SkillMasteryData } from '@lms/contracts';

const minimumQuestionCount = 5;

export type WeakSkill = SkillMasteryData & { questionCount: number };

export function hasSkillEvidence(skill: SkillMasteryData): skill is WeakSkill {
  const { evidenceCount, questionCount } = skill;
  return (
    evidenceCount > 0 &&
    typeof questionCount === 'number' &&
    Number.isSafeInteger(questionCount) &&
    questionCount >= minimumQuestionCount
  );
}

export function weakSkills(
  skills: readonly SkillMasteryData[],
  activeSkillIds: ReadonlySet<string>,
): WeakSkill[] {
  return skills
    .filter((skill): skill is WeakSkill => {
      const { skillId, level } = skill;
      return (
        activeSkillIds.has(skillId) &&
        level === 'BEGINNER' &&
        hasSkillEvidence(skill)
      );
    })
    .sort(
      (a, b) =>
        a.scorePercent - b.scorePercent || a.skillId.localeCompare(b.skillId),
    );
}
