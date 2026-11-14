import { Injectable } from '@nestjs/common';

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
  // Recover the low bits lost when adding many decimal scores.
  for (const row of evidence) {
    const value = row[field] - correction;
    const next = total + value;
    correction = next - total - value;
    total = next;
  }
  return total;
}

@Injectable()
export class MasteryCalculator {
  readonly algorithmVersion = 'weighted-score-v1';

  // The caller supplies at least one valid graded result for the same skill.
  scorePercent(evidence: readonly SkillEvidenceScore[]): number {
    const totalScore = sum(evidence, 'score');
    const totalMaxScore = sum(evidence, 'maxScore');
    return (totalScore / totalMaxScore) * 100;
  }
}
