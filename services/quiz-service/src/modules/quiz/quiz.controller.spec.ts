import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { CreateQuizRequest, QuizData } from '@lms/contracts';
import ids from '@lms/contracts/fixtures/ids.json';
import request from 'supertest';
import type { App } from 'supertest/types';
import { QuizAuthModule } from '../../common/auth/quiz-auth.module';
import { HttpExceptionFilter } from '../../common/filters/http-exception.filter';
import { requestContext } from '../../common/middleware/request-context.middleware';
import { QuizController } from './quiz.controller';
import { QuizService } from './quiz.service';

const userId = ids.users.instructorA;
const courseId = '22222222-2222-4222-8222-222222222222';
const chapterId = '33333333-3333-4333-8333-333333333333';
const lessonId = '44444444-4444-4444-8444-444444444444';
const quizId = '55555555-5555-4555-8555-555555555555';
const body: CreateQuizRequest = {
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
const quiz: QuizData = {
  ...body,
  id: quizId,
  instructorId: userId,
  status: 'DRAFT',
  assessmentVersion: 1,
  version: 1,
};

describe('QuizController create endpoint', () => {
  let app: INestApplication<App>;
  const create = jest.fn();
  const originalNodeEnv = process.env.NODE_ENV;
  const originalMockAuth = process.env.MOCK_AUTH;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.MOCK_AUTH = 'true';
    const moduleRef = await Test.createTestingModule({
      imports: [QuizAuthModule],
      controllers: [QuizController],
      providers: [
        { provide: QuizService, useValue: { create } },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(requestContext);
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  beforeEach(() => {
    create.mockReset().mockResolvedValue(quiz);
  });

  afterAll(async () => {
    await app.close();
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    if (originalMockAuth === undefined) delete process.env.MOCK_AUTH;
    else process.env.MOCK_AUTH = originalMockAuth;
  });

  it('serves the contract path with a 201 response envelope', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/quizzes')
      .set('X-Mock-User', 'instructorA')
      .set('X-Request-Id', 'quiz-create-123')
      .send(body)
      .expect(201)
      .expect({
        data: quiz,
        meta: { requestId: 'quiz-create-123' },
      });

    expect(create).toHaveBeenCalledWith(
      body,
      expect.objectContaining({ id: userId, role: 'INSTRUCTOR' }),
      {
        authorization: undefined,
        mockUser: 'instructorA',
        requestId: 'quiz-create-123',
      },
    );
  });

  it('rejects invalid contract input before calling the service', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/quizzes')
      .set('X-Mock-User', 'instructorA')
      .send({ ...body, placement: 'SECTION_END' })
      .expect(400)
      .expect((response) => {
        expect(response.body.error.code).toBe('VALIDATION_ERROR');
      });

    expect(create).not.toHaveBeenCalled();
  });
});
