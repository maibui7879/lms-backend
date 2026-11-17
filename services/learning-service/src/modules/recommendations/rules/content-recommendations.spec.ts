import type { QuizRecommendationContext } from '@lms/contracts';
import { quizRecommendation } from './content-recommendations';
import type { WeakSkill } from './weak-skills';

describe('ADP-03 practice quiz recommendation', () => {
  const skills: WeakSkill[] = [
    {
      skillId: 'skill-a',
      skillName: 'Tổ chức module',
      scorePercent: 35,
      evidenceCount: 2,
      questionCount: 8,
      level: 'BEGINNER',
    },
  ];
  const item = {
    courseId: 'course',
    lessonId: 'lesson',
    id: 'item',
    title: 'Ôn tập module',
    order: 0,
  };
  const available: QuizRecommendationContext = {
    courseId: item.courseId,
    quizId: 'quiz',
    userId: 'learner',
    assessmentVersion: 2,
    quizType: 'PRACTICE',
    skillIds: ['SKILL-A'],
    canStart: true,
    attemptsRemaining: 2,
  };

  it('returns the accessible quiz item and explains both the evidence and remaining attempts', () => {
    expect(
      quizRecommendation(item, available, skills, new Map())?.data,
    ).toEqual({
      courseId: 'course',
      lessonId: 'lesson',
      learningItemId: 'item',
      reason: 'LOW_MASTERY',
      explanation:
        'Kỹ năng Tổ chức module đạt 35% từ 8 câu đã chấm. Làm “Ôn tập module”. Còn 2 lượt.',
    });
  });

  it('requires a skill match, permission, remaining attempts and practice type', () => {
    for (const override of [
      { skillIds: ['other-skill'] },
      { quizType: 'GRADED' as const },
      { canStart: false },
      { attemptsRemaining: 0 },
    ]) {
      expect(
        quizRecommendation(
          item,
          { ...available, ...override },
          skills,
          new Map(),
        ),
      ).toBeNull();
    }
    expect(quizRecommendation(item, null, skills, new Map())).toBeNull();
  });
});
