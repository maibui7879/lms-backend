import { ForbiddenException } from '@nestjs/common';
import type { AuthUser, CreateQuizRequest } from '@lms/contracts';
import type { Repository } from 'typeorm';
import type {
  CourseClient,
  CourseRequestContext,
} from '../../integrations/course.client';
import { Quiz } from './entities/quiz.entity';
import { QuizService } from './quiz.service';

const courseId = '11111111-1111-4111-8111-111111111111';
const chapterId = '22222222-2222-4222-8222-222222222222';
const lessonId = '33333333-3333-4333-8333-333333333333';
const instructorId = '44444444-4444-4444-8444-444444444444';
const quizId = '55555555-5555-4555-8555-555555555555';
const request: CreateQuizRequest = {
  courseId,
  chapterId,
  lessonId,
  placement: 'LESSON',
  title: 'Lesson quiz',
  policy: {
    quizType: 'GRADED',
    durationSeconds: 900,
    passingScorePercent: 70,
    maxAttempts: 2,
    requiredForCompletion: true,
    shuffleQuestions: false,
    shuffleChoices: false,
    reviewPolicy: 'AFTER_SUBMISSION',
  },
};
const instructor: AuthUser = {
  id: instructorId,
  email: 'instructor@example.test',
  role: 'INSTRUCTOR',
  status: 'ACTIVE',
};
const context: CourseRequestContext = {
  authorization: 'Bearer user.jwt.token',
  requestId: 'request-123',
};

describe('QuizService.create', () => {
  const requireQuizPlacement = jest.fn();
  const repositoryCreate = jest.fn();
  const repositorySave = jest.fn();
  const course = {
    requireQuizPlacement,
  } as unknown as CourseClient;
  const quizzes = {
    create: repositoryCreate,
    save: repositorySave,
  } as unknown as Repository<Quiz>;
  const service = new QuizService(quizzes, course);

  beforeEach(() => {
    jest.clearAllMocks();
    repositoryCreate.mockImplementation((values) => values);
    repositorySave.mockImplementation(async (values) => ({
      ...values,
      id: quizId,
    }));
  });

  it('creates a DRAFT owned by the authenticated instructor and returns contract data', async () => {
    const result = await service.create(request, instructor, context);

    expect(requireQuizPlacement).toHaveBeenCalledWith(request, context);
    expect(repositoryCreate).toHaveBeenCalledWith({
      ...request,
      instructorId,
      status: 'DRAFT',
      assessmentVersion: 1,
      version: 1,
    });
    expect(result).toEqual({
      ...request,
      id: quizId,
      instructorId,
      status: 'DRAFT',
      assessmentVersion: 1,
      version: 1,
    });
  });

  it('rejects non-instructors before Course or database calls', async () => {
    await expect(
      service.create(request, { ...instructor, role: 'STUDENT' }, context),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(requireQuizPlacement).not.toHaveBeenCalled();
    expect(repositorySave).not.toHaveBeenCalled();
  });

  it('does not persist if Course cannot verify ownership or placement', async () => {
    requireQuizPlacement.mockRejectedValue(new Error('Course unavailable'));

    await expect(service.create(request, instructor, context)).rejects.toThrow(
      'Course unavailable',
    );
    expect(repositorySave).not.toHaveBeenCalled();
  });
});
