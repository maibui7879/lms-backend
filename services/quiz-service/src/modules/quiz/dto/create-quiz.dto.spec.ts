import { BadRequestException } from '@nestjs/common';
import type { CreateQuizRequest } from '@lms/contracts';
import { validateCreateQuiz } from './create-quiz.dto';

const uuid = '11111111-1111-4111-8111-111111111111';
const policy = {
  quizType: 'GRADED',
  durationSeconds: 900,
  passingScorePercent: 70,
  maxAttempts: 2,
  requiredForCompletion: true,
  shuffleQuestions: false,
  shuffleChoices: false,
  reviewPolicy: 'AFTER_SUBMISSION',
} as const;

describe('validateCreateQuiz', () => {
  it('accepts and preserves both contract placement variants', () => {
    const lessonRequest: CreateQuizRequest = {
      courseId: uuid,
      chapterId: uuid,
      title: 'Lesson quiz',
      policy,
      placement: 'LESSON',
      lessonId: uuid,
    };
    const sectionRequest: CreateQuizRequest = {
      courseId: uuid,
      chapterId: uuid,
      title: 'Section quiz',
      policy,
      placement: 'SECTION_END',
      lessonId: null,
    };

    expect(validateCreateQuiz(lessonRequest)).toEqual(lessonRequest);
    expect(validateCreateQuiz(sectionRequest)).toEqual(sectionRequest);
  });

  it('rejects payloads that violate the shared request schema', () => {
    expect(() =>
      validateCreateQuiz({
        courseId: uuid,
        chapterId: uuid,
        title: 'Section quiz',
        policy,
        placement: 'SECTION_END',
        lessonId: uuid,
      }),
    ).toThrow(BadRequestException);
  });
});
