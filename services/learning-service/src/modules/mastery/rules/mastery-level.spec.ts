import { MasteryCalculator } from '../mastery-calculator';
import { classifyMastery, readMasteryThresholds } from './mastery-level';

describe('MST-04 skill mastery levels', () => {
  it.each([
    [0, 'BEGINNER'],
    [39.999, 'BEGINNER'],
    [39.999999999, 'BEGINNER'],
    [40, 'DEVELOPING'],
    [40.001, 'DEVELOPING'],
    [69.999, 'DEVELOPING'],
    [69.999999999, 'DEVELOPING'],
    [70, 'PROFICIENT'],
    [70.001, 'PROFICIENT'],
    [100, 'PROFICIENT'],
  ])(
    'classifies score %s as %s without rounding before comparison',
    (scorePercent, level) => {
      expect(classifyMastery({ scorePercent, evidenceCount: 1 })).toBe(level);
    },
  );

  it('returns no level when a skill has no evidence', () => {
    expect(classifyMastery(null)).toBeNull();
    expect(classifyMastery({ scorePercent: 0, evidenceCount: 0 })).toBeNull();
  });

  it('applies configured boundaries to the same score', () => {
    const evidence = { scorePercent: 70, evidenceCount: 3 };
    expect(classifyMastery(evidence)).toBe('PROFICIENT');
    expect(
      classifyMastery(evidence, { developingMin: 50, proficientMin: 80 }),
    ).toBe('DEVELOPING');
  });

  it.each([
    [
      [
        { score: 0.03, maxScore: 0.4 },
        { score: 0.29, maxScore: 0.4 },
      ],
      'DEVELOPING',
    ],
    [
      [
        { score: 0.1, maxScore: 0.1 },
        { score: 4.1, maxScore: 5.9 },
      ],
      'PROFICIENT',
    ],
  ] as const)(
    'places a decimal sum at its mathematical cutoff',
    (scores, expected) => {
      const scorePercent = new MasteryCalculator().scorePercent(scores);
      expect(
        classifyMastery({ scorePercent, evidenceCount: scores.length }),
      ).toBe(expected);
    },
  );

  it('loads defaults and rejects invalid deployment configuration', () => {
    expect(readMasteryThresholds({})).toEqual({
      developingMin: 40,
      proficientMin: 70,
    });
    expect(
      readMasteryThresholds({
        LEARNING_MASTERY_DEVELOPING_MIN: '45',
        LEARNING_MASTERY_PROFICIENT_MIN: '75',
      }),
    ).toEqual({ developingMin: 45, proficientMin: 75 });
    expect(() =>
      readMasteryThresholds({
        LEARNING_MASTERY_DEVELOPING_MIN: '50',
        LEARNING_MASTERY_PROFICIENT_MIN: '40',
      }),
    ).toThrow(RangeError);
  });

  it('preserves decimal cutoffs after repeatedly adding valid grades', () => {
    for (const [evidence, expected] of [
      [{ score: 0.6, maxScore: 1.5 }, 'DEVELOPING'],
      [{ score: 0.7, maxScore: 1 }, 'PROFICIENT'],
    ] as const) {
      const scores = Array.from({ length: 20 }, () => evidence);
      const scorePercent = new MasteryCalculator().scorePercent(scores);
      expect(
        classifyMastery({ scorePercent, evidenceCount: scores.length }),
      ).toBe(expected);
    }
  });

  it.each([
    [
      [2.86, 5.02, 5.09, 0.15, 0.12, 0.02],
      [5.19, 9.8, 6.43, 3.69, 3.71, 4.33],
      'DEVELOPING',
    ],
    [
      [0.1, 8.2, 1.17, 0.76, 0.86, 0.25],
      [2.57, 9.88, 1.78, 0.81, 0.91, 0.25],
      'PROFICIENT',
    ],
  ] as const)(
    'classifies mixed decimal scores at the cutoff',
    (scores, maxima, expected) => {
      const scorePercent = new MasteryCalculator().scorePercent(
        scores.map((score, index) => ({ score, maxScore: maxima[index] })),
      );
      expect(
        classifyMastery({ scorePercent, evidenceCount: scores.length }),
      ).toBe(expected);
    },
  );

  it.each([
    { developingMin: 70, proficientMin: 40 },
    { developingMin: 40, proficientMin: 40 },
    { developingMin: 0, proficientMin: 70 },
    { developingMin: 40, proficientMin: 101 },
    { developingMin: Number.NaN, proficientMin: 70 },
  ])(
    'rejects invalid thresholds $developingMin and $proficientMin',
    (thresholds) => {
      expect(() => classifyMastery(null, thresholds)).toThrow(RangeError);
    },
  );

  it.each([
    { scorePercent: -1, evidenceCount: 1 },
    { scorePercent: 101, evidenceCount: 1 },
    { scorePercent: Number.NaN, evidenceCount: 1 },
    { scorePercent: 50, evidenceCount: -1 },
    { scorePercent: 50, evidenceCount: 1.5 },
  ])(
    'rejects invalid score $scorePercent or evidence count $evidenceCount',
    (evidence) => {
      expect(() => classifyMastery(evidence)).toThrow(RangeError);
    },
  );
});
