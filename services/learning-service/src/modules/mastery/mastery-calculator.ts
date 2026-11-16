import { Injectable } from '@nestjs/common';
import { weightedScorePercent } from './rules/weighted-score';
import type { SkillEvidenceScore } from './rules/weighted-score';

@Injectable()
export class MasteryCalculator {
  readonly algorithmVersion = 'weighted-score-v1';

  // The caller supplies at least one valid graded result for the same skill.
  scorePercent(evidence: readonly SkillEvidenceScore[]): number {
    return weightedScorePercent(evidence);
  }
}
