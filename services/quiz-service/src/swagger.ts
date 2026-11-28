import type { INestApplication } from '@nestjs/common';
import {
  DocumentBuilder,
  SwaggerModule,
  type OpenAPIObject,
} from '@nestjs/swagger';
import quizContract from '@lms/contracts/openapi/quiz.json';

export function setupSwagger(app: INestApplication): OpenAPIObject {
  const swaggerConfig = new DocumentBuilder()
    .setTitle('LMS Quiz Service API')
    .setDescription('Quiz authoring, attempt and grading service')
    .setVersion('1.0')
    .setOpenAPIVersion(quizContract.openapi)
    .addBearerAuth(undefined, 'bearerAuth')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  const quizPath = '/api/v1/quizzes';
  const createQuiz = document.paths[quizPath]?.post;

  if (createQuiz) {
    const contract = quizContract.paths[quizPath].post;
    const { responses, ...operation } = contract;
    Object.assign(createQuiz, operation);
    createQuiz.responses = {
      ...Object.fromEntries(
        Object.entries(responses)
          .filter(([status]) => status !== '201')
          .map(([status, response]) => [
            status,
            {
              ...response,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ApiErrorResponse' },
                },
              },
            },
          ]),
      ),
      '201': responses['201'],
    };
    document.components ??= {};
    // The generated contract uses OpenAPI 3.1 JSON Schema keywords.
    document.components.schemas = Object.assign(
      {},
      document.components.schemas,
      quizContract.components.schemas,
    );
  }

  const updateQuiz = document.paths['/api/v1/quizzes/{id}']?.patch;
  if (updateQuiz) {
    const contract = quizContract.paths['/api/v1/quizzes/{id}'].patch;
    const { responses, ...operation } = contract;
    Object.assign(updateQuiz, operation);
    updateQuiz.responses = Object.fromEntries(
      Object.entries(responses).map(([status, response]) => [
        status,
        status === '200'
          ? response
          : {
              ...response,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ApiErrorResponse' },
                },
              },
            },
      ]),
    );
  }

  const createQuestion = document.paths['/api/v1/quizzes/{id}/questions']?.post;
  const listQuestions = document.paths['/api/v1/quizzes/{id}/questions']?.get;
  if (listQuestions) {
    const contract = quizContract.paths['/api/v1/quizzes/{id}/questions'].get;
    const { responses, ...operation } = contract;
    Object.assign(listQuestions, operation);
    listQuestions.responses = Object.fromEntries(
      Object.entries(responses).map(([status, response]) => [
        status,
        status === '200'
          ? response
          : {
              ...response,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ApiErrorResponse' },
                },
              },
            },
      ]),
    );
  }
  if (createQuestion) {
    const contract = quizContract.paths['/api/v1/quizzes/{id}/questions'].post;
    const { responses, ...operation } = contract;
    Object.assign(createQuestion, operation);
    createQuestion.responses = Object.fromEntries(
      Object.entries(responses).map(([status, response]) => [
        status,
        status === '201'
          ? response
          : {
              ...response,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ApiErrorResponse' },
                },
              },
            },
      ]),
    );
    document.components ??= {};
    document.components.schemas = Object.assign(
      {},
      document.components.schemas,
      quizContract.components.schemas,
    );
  }

  const updateQuestion = document.paths['/api/v1/questions/{id}']?.patch;
  if (updateQuestion) {
    const contract = quizContract.paths['/api/v1/questions/{id}'].patch;
    const { responses, ...operation } = contract;
    Object.assign(updateQuestion, operation);
    updateQuestion.responses = Object.fromEntries(
      Object.entries(responses).map(([status, response]) => [
        status,
        status === '200'
          ? response
          : {
              ...response,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ApiErrorResponse' },
                },
              },
            },
      ]),
    );
  }

  const deleteQuestion = document.paths['/api/v1/questions/{id}']?.delete;
  if (deleteQuestion) {
    const contract = quizContract.paths['/api/v1/questions/{id}'].delete;
    const { responses, ...operation } = contract;
    Object.assign(deleteQuestion, operation);
    deleteQuestion.responses = Object.fromEntries(
      Object.entries(responses).map(([status, response]) => [
        status,
        status === '204'
          ? response
          : {
              ...response,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ApiErrorResponse' },
                },
              },
            },
      ]),
    );
  }

  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'docs-json',
    customSiteTitle: 'LMS Quiz Service API',
  });

  return document;
}
