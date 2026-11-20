import type { SkillMasteryData, SkillPrerequisiteEdge } from '@lms/contracts';
import type { RecommendationTarget } from './rank-recommendations';
import type { WeakSkill } from './weak-skills';

function prerequisitesBySkill(edges: readonly SkillPrerequisiteEdge[]) {
  const adjacent = new Map<string, string[]>();
  for (const { skillId, prerequisiteSkillId } of edges) {
    const dependencies = adjacent.get(skillId) ?? [];
    dependencies.push(prerequisiteSkillId);
    adjacent.set(skillId, dependencies);
  }
  return adjacent;
}

export function normalizePrerequisites(
  input: readonly SkillPrerequisiteEdge[],
  activeIds: ReadonlySet<string>,
) {
  const edges = input.map(({ skillId, prerequisiteSkillId }) => ({
    skillId: skillId.toLowerCase(),
    prerequisiteSkillId: prerequisiteSkillId.toLowerCase(),
  }));
  const skillIds = [
    ...new Set(
      edges.flatMap(({ skillId, prerequisiteSkillId }) => [
        skillId,
        prerequisiteSkillId,
      ]),
    ),
  ];
  const invalid = skillIds.filter((id) => !activeIds.has(id));
  if (invalid.length)
    return {
      error: 'INVALID_SKILL_REFERENCE',
      message: 'Each skill must be active and belong to this course',
      skillIds: invalid,
    } as const;
  if (
    new Set(
      edges.map(
        ({ skillId, prerequisiteSkillId }) =>
          `${skillId}:${prerequisiteSkillId}`,
      ),
    ).size !== edges.length
  )
    return {
      error: 'VALIDATION_ERROR',
      message: 'Duplicate prerequisite edges',
    } as const;

  const adjacent = prerequisitesBySkill(edges);
  const visiting = new Set<string>();
  const visited = new Set<string>();
  function hasCycle(id: string): boolean {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    if ((adjacent.get(id) ?? []).some(hasCycle)) return true;
    visiting.delete(id);
    visited.add(id);
    return false;
  }
  if (skillIds.some(hasCycle))
    return {
      error: 'VALIDATION_ERROR',
      message: 'Skill prerequisites cannot contain cycles',
    } as const;
  return {
    edges: edges.sort(
      (a, b) =>
        a.skillId.localeCompare(b.skillId) ||
        a.prerequisiteSkillId.localeCompare(b.prerequisiteSkillId),
    ),
  };
}

export function recommendationTargets(
  weak: readonly WeakSkill[],
  skills: readonly SkillMasteryData[],
  active: ReadonlyMap<string, string>,
  edges: readonly SkillPrerequisiteEdge[],
  trends: ReadonlyMap<string, number>,
): RecommendationTarget[] {
  const mastery = new Map(skills.map((skill) => [skill.skillId, skill]));
  const adjacent = prerequisitesBySkill(
    edges.filter(
      ({ skillId, prerequisiteSkillId }) =>
        active.has(skillId) && active.has(prerequisiteSkillId),
    ),
  );
  const memo = new Map<string, string[]>();
  function unmet(id: string): string[] {
    const cached = memo.get(id);
    if (cached) return cached;
    const frontier = [
      ...new Set(
        (adjacent.get(id) ?? []).flatMap((dependency) => {
          const deeper = unmet(dependency);
          if (deeper.length) return deeper;
          return mastery.get(dependency)?.level === 'PROFICIENT'
            ? []
            : [dependency];
        }),
      ),
    ];
    memo.set(id, frontier);
    return frontier;
  }

  const targets = new Map<string, RecommendationTarget>();
  for (const skill of weak) {
    const blockers = unmet(skill.skillId);
    if (!blockers.length) {
      if (!targets.has(skill.skillId))
        targets.set(skill.skillId, {
          ...skill,
          trend: trends.get(skill.skillId),
        });
      continue;
    }
    for (const id of blockers) {
      if (targets.get(id)?.prerequisiteFor) continue;
      const evidence = mastery.get(id);
      const name = active.get(id);
      targets.set(id, {
        skillId: id,
        skillName: name,
        scorePercent: evidence?.scorePercent,
        questionCount: evidence?.questionCount,
        trend: trends.get(id),
        prerequisiteFor: skill.skillName ?? skill.skillId,
      });
    }
  }
  return [...targets.values()];
}
