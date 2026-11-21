import type { MasteryData } from '@lms/contracts';

type SkillMastery = MasteryData['skills'][number];
type SkillEvidence = Pick<SkillMastery, 'scorePercent' | 'evidenceCount'>;

interface MasteryThresholds {
  developingMin: number;
  proficientMin: number;
}

const defaultThresholds: MasteryThresholds = {
  developingMin: 40,
  proficientMin: 70,
};

function validateThresholds({
  developingMin,
  proficientMin,
}: MasteryThresholds) {
  if (
    !Number.isFinite(developingMin) ||
    !Number.isFinite(proficientMin) ||
    developingMin <= 0 ||
    developingMin >= proficientMin ||
    proficientMin > 100
  ) {
    throw new RangeError(
      'Mastery thresholds must satisfy 0 < developingMin < proficientMin <= 100',
    );
  }
}

export function readMasteryThresholds(
  env: NodeJS.ProcessEnv,
): MasteryThresholds {
  const thresholds = {
    developingMin: Number(
      env.LEARNING_MASTERY_DEVELOPING_MIN ?? defaultThresholds.developingMin,
    ),
    proficientMin: Number(
      env.LEARNING_MASTERY_PROFICIENT_MIN ?? defaultThresholds.proficientMin,
    ),
  };
  validateThresholds(thresholds);
  return thresholds;
}

function reaches(score: number, threshold: number): boolean {
  // Allow floating-point error from summing, dividing, and converting to a percentage.
  return threshold - score <= 4 * Number.EPSILON * threshold;
}

/** Classifies an already calculated score. Missing evidence has no level. */
export function classifyMastery(
  evidence: SkillEvidence | null,
  thresholds: MasteryThresholds = defaultThresholds,
): SkillMastery['level'] | null {
  validateThresholds(thresholds);

  if (evidence === null) return null;

  const { evidenceCount, scorePercent } = evidence;
  if (!Number.isSafeInteger(evidenceCount) || evidenceCount < 0)
    throw new RangeError(
      'Mastery evidence count must be a non-negative integer',
    );
  if (evidenceCount === 0) return null;

  if (!Number.isFinite(scorePercent) || scorePercent < 0 || scorePercent > 100)
    throw new RangeError('Mastery score must be between 0 and 100');

  if (reaches(scorePercent, thresholds.proficientMin)) return 'PROFICIENT';
  if (reaches(scorePercent, thresholds.developingMin)) return 'DEVELOPING';
  return 'BEGINNER';
}
