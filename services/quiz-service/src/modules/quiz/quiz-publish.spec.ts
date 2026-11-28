import {
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { AuthUser, QuizPolicy } from '@lms/contracts';
import type { Repository } from 'typeorm';
import type { CourseClient } from '../../integrations/course.client';
import { QuizQuestion } from '../quiz-question/entities/quiz-question.entity';
import { Quiz } from './entities/quiz.entity';
import { QuizService } from './quiz.service';

const id = '11111111-1111-4111-8111-111111111111';
const user: AuthUser = {
  id,
  email: 'owner@example.test',
  role: 'INSTRUCTOR',
  status: 'ACTIVE',
};
const policy: QuizPolicy = {
  quizType: 'GRADED',
  durationSeconds: 600,
  passingScorePercent: 70,
  maxAttempts: 2,
  requiredForCompletion: true,
  shuffleQuestions: false,
  shuffleChoices: false,
  reviewPolicy: 'AFTER_SUBMISSION',
};
const quiz = Object.assign(new Quiz(), {
  id,
  courseId: id,
  chapterId: id,
  lessonId: id,
  placement: 'LESSON',
  title: 'Quiz',
  instructorId: id,
  status: 'DRAFT',
  policy,
  assessmentVersion: 1,
  version: 1,
});
const question = Object.assign(new QuizQuestion(), {
  id,
  quizId: id,
  type: 'SINGLE_CHOICE',
  prompt: 'Question',
  points: '2',
  choices: [
    { id: '22222222-2222-4222-8222-222222222222', text: 'A' },
    { id: '33333333-3333-4333-8333-333333333333', text: 'B' },
  ],
  correctChoiceIds: ['22222222-2222-4222-8222-222222222222'],
});

describe('QuizService.publish', () => {
  const findQuiz = jest.fn();
  const findLockedQuiz = jest.fn();
  const findQuestions = jest.fn();
  const save = jest.fn();
  const requireQuizPlacement = jest.fn();
  const requirePublishReference = jest.fn();
  const course = {
    requireQuizPlacement,
    requirePublishReference,
  } as unknown as CourseClient;
  const quizzes = {
    findOneBy: findQuiz,
    manager: {
      transaction: async (callback: (manager: unknown) => Promise<unknown>) =>
        callback({
          getRepository: (entity: unknown) =>
            entity === Quiz
              ? { findOne: findLockedQuiz, save }
              : { findBy: findQuestions },
        }),
    },
  } as unknown as Repository<Quiz>;
  const service = new QuizService(quizzes, course);

  beforeEach(() => {
    jest.clearAllMocks();
    findQuiz.mockResolvedValue(quiz);
    findLockedQuiz.mockImplementation(async () =>
      Object.assign(new Quiz(), quiz),
    );
    findQuestions.mockResolvedValue([question]);
    save.mockImplementation(async (value) => value);
  });

  it('publishes a valid draft with matching Course reference', async () => {
    const result = await service.publish(id, { expectedVersion: 1 }, user, {
      requestId: 'req',
    });
    expect(result.status).toBe('PUBLISHED');
    expect(result.version).toBe(2);
    expect(requirePublishReference).toHaveBeenCalled();
  });

  it('rejects a draft without questions', async () => {
    findQuestions.mockResolvedValue([]);
    await expect(
      service.publish(id, { expectedVersion: 1 }, user, { requestId: 'req' }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(save).not.toHaveBeenCalled();
  });

  it('rejects a version changed since the caller read the quiz', async () => {
    await expect(
      service.publish(id, { expectedVersion: 2 }, user, { requestId: 'req' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(save).not.toHaveBeenCalled();
  });

  it('rejects a quiz published before acquiring the database lock', async () => {
    findLockedQuiz.mockResolvedValue(
      Object.assign(new Quiz(), quiz, { status: 'PUBLISHED' }),
    );
    await expect(
      service.publish(id, { expectedVersion: 1 }, user, { requestId: 'req' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(save).not.toHaveBeenCalled();
  });
});
