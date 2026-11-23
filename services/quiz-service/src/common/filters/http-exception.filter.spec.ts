import {
  InternalServerErrorException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import type { ApiErrorResponse } from '@lms/contracts';
import { HttpExceptionFilter } from './http-exception.filter';

describe('HttpExceptionFilter', () => {
  function host(headers: Record<string, string>) {
    const response = {
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const argumentHost = {
      switchToHttp: () => ({
        getRequest: () => ({ headers }),
        getResponse: () => response,
      }),
    } as unknown as ArgumentsHost;
    return { argumentHost, response };
  }

  it('formats known errors according to the shared API error contract', () => {
    const { argumentHost, response } = host({
      'x-request-id': 'quiz-request-1',
    });

    new HttpExceptionFilter().catch(
      new UnprocessableEntityException({
        code: 'INVALID_QUIZ_POLICY',
        message: 'Invalid quiz policy',
        details: { issues: ['durationSeconds must be positive'] },
      }),
      argumentHost,
    );

    const body = response.json.mock.calls[0][0] as ApiErrorResponse;
    expect(response.status).toHaveBeenCalledWith(422);
    expect(response.setHeader).toHaveBeenCalledWith(
      'X-Request-Id',
      'quiz-request-1',
    );
    expect(body).toMatchObject({
      error: {
        code: 'INVALID_QUIZ_POLICY',
        message: 'Invalid quiz policy',
        details: { issues: ['durationSeconds must be positive'] },
      },
      requestId: 'quiz-request-1',
    });
    expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
  });

  it('does not expose unexpected server error details', () => {
    const { argumentHost, response } = host({});

    new HttpExceptionFilter().catch(
      new InternalServerErrorException('database password'),
      argumentHost,
    );

    const body = response.json.mock.calls[0][0] as ApiErrorResponse;
    expect(body.error).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      details: {},
    });
  });
});
