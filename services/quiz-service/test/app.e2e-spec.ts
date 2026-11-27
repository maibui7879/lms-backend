import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppController } from '../src/app.controller';
import { AppService } from '../src/app.service';
import { TerminusModule, TypeOrmHealthIndicator } from '@nestjs/terminus';
import { HealthController } from '../src/health/health.controller';
import { setupSwagger } from '../src/swagger';
import { QuizController } from '../src/modules/quiz/quiz.controller';
import { QuizService } from '../src/modules/quiz/quiz.service';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [TerminusModule],
      controllers: [AppController, HealthController, QuizController],
      providers: [
        AppService,
        { provide: QuizService, useValue: { create: jest.fn() } },
        {
          provide: TypeOrmHealthIndicator,
          useValue: {
            pingCheck: jest.fn().mockResolvedValue({
              database: { status: 'up' },
            }),
          },
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    setupSwagger(app);
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect((response) => {
        expect(response.body.status).toBe('ok');
      });
  });

  it('/docs-json (GET)', () => {
    return request(app.getHttpServer())
      .get('/docs-json')
      .expect(200)
      .expect((response) => {
        expect(response.body.info.title).toBe('LMS Quiz Service API');
        expect(response.body.components.securitySchemes).toHaveProperty(
          'bearerAuth',
        );
        expect(response.body.paths['/health'].get).toBeDefined();
        const operation = response.body.paths['/api/v1/quizzes'].post;
        expect(operation.operationId).toBe('createQuiz');
        expect(operation.security).toEqual([{ bearerAuth: [] }]);
        expect(
          operation.requestBody.content['application/json'].schema.$ref,
        ).toBe('#/components/schemas/CreateQuizRequest');
        expect(
          operation.responses['201'].content['application/json'].schema
            .properties,
        ).toEqual({
          data: { $ref: '#/components/schemas/QuizData' },
          meta: { $ref: '#/components/schemas/ApiMeta' },
        });
        expect(Object.keys(operation.responses)).toEqual([
          '201',
          '400',
          '401',
          '403',
          '404',
          '409',
          '422',
          '503',
          '504',
        ]);
        expect(
          operation.responses['422'].content['application/json'].schema.$ref,
        ).toBe('#/components/schemas/ApiErrorResponse');
      });
  });

  afterEach(async () => {
    await app.close();
  });
});
