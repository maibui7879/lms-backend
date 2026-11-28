import { ConflictException } from '@nestjs/common';
import type { AuthUser, CreateQuestionRequest } from '@lms/contracts';
import type { Repository } from 'typeorm';
import { Quiz } from '../quiz/entities/quiz.entity';
import { QuizQuestion } from './entities/quiz-question.entity';
import { QuizQuestionService } from './quiz-question.service';
import type { CourseClient } from '../../integrations/course.client';

const id = '11111111-1111-4111-8111-111111111111';
const user: AuthUser = {
  id,
  email: 'owner@example.test',
  role: 'INSTRUCTOR',
  status: 'ACTIVE',
};
const quiz = {
  id,
  instructorId: id,
  courseId: id,
  chapterId: id,
  lessonId: id,
  placement: 'LESSON',
  title: 'Quiz',
  status: 'DRAFT',
  policy: { quizType: 'PRACTICE' },
} as Quiz;
const body: CreateQuestionRequest = {
  type: 'SINGLE_CHOICE',
  prompt: 'Question?',
  points: 2,
  skillIds: [],
  choices: [
    { id: '22222222-2222-4222-8222-222222222222', text: 'A' },
    { id: '33333333-3333-4333-8333-333333333333', text: 'B' },
  ],
  correctChoiceIds: ['22222222-2222-4222-8222-222222222222'],
  explanation: null,
};

describe('QuizQuestionService.create', () => {
  const findQuiz = jest.fn();
  const findLockedQuiz = jest.fn();
  const save = jest.fn();
  const countBy = jest.fn();
  const repository = { findOneBy: findQuiz } as unknown as Repository<Quiz>;
  const questionRepository = {
    manager: {
      transaction: async (callback: (manager: unknown) => Promise<unknown>) =>
        callback({
          getRepository: (entity: unknown) =>
            entity === Quiz
              ? { findOne: findLockedQuiz }
              : { countBy, create: (value: unknown) => value, save },
        }),
    },
  } as unknown as Repository<QuizQuestion>;
  const course = { requireQuizPlacement: jest.fn() } as unknown as CourseClient;
  const service = new QuizQuestionService(
    repository,
    questionRepository,
    course,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    findQuiz.mockResolvedValue(quiz);
    findLockedQuiz.mockResolvedValue(quiz);
    countBy.mockResolvedValue(0);
    save.mockImplementation(async (value) => ({ ...value, id, points: '2' }));
  });

  it('creates an authoring question for a draft practice quiz', async () => {
    const result = await service.create(id, body, user, { requestId: 'req-1' });
    expect(result).toEqual({ id, ...body, version: 1 });
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ skillIds: [], sortOrder: 0 }),
    );
  });

  it('rejects a quiz published between the initial read and the database write', async () => {
    findLockedQuiz.mockResolvedValue(
      Object.assign(new Quiz(), quiz, { status: 'PUBLISHED' }),
    );
    await expect(
      service.create(id, body, user, { requestId: 'req-1' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(save).not.toHaveBeenCalled();
  });
});
