export interface SkillEvidenceScore {
  score: number;
  maxScore: number;
}

function sum(
  evidence: readonly SkillEvidenceScore[],
  field: keyof SkillEvidenceScore,
): number {
  let total = 0;
  let correction = 0;
  // Keep rounding error from accumulating across attempts.
  for (const row of evidence) {
    const value = row[field] - correction;
    const next = total + value;
    correction = next - total - value;
    total = next;
  }
  return total;
}

export function weightedScorePercent(
  evidence: readonly SkillEvidenceScore[],
): number {
  return (sum(evidence, 'score') / sum(evidence, 'maxScore')) * 100;
}
