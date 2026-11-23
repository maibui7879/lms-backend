import { Catch, HttpException } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { ERROR_HTTP_STATUS } from '@lms/contracts';
import type { ApiErrorResponse, DomainErrorCode } from '@lms/contracts';

const defaultCodes: Partial<Record<number, DomainErrorCode>> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'VERSION_CONFLICT',
  503: 'SERVICE_UNAVAILABLE',
  504: 'GATEWAY_TIMEOUT',
};

function isDomainErrorCode(value: unknown): value is DomainErrorCode {
  return typeof value === 'string' && Object.hasOwn(ERROR_HTTP_STATUS, value);
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const status = error instanceof HttpException ? error.getStatus() : 500;
    const payload = error instanceof HttpException ? error.getResponse() : null;
    const body =
      payload && typeof payload === 'object'
        ? (payload as Record<string, unknown>)
        : {};
    const suppliedCode = body.code;
    const code =
      isDomainErrorCode(suppliedCode) &&
      ERROR_HTTP_STATUS[suppliedCode] === status
        ? suppliedCode
        : (defaultCodes[status] ?? 'INTERNAL_ERROR');
    const requestHeader = request.headers['x-request-id'];
    const requestId =
      typeof requestHeader === 'string' ? requestHeader : randomUUID();
    const details =
      body.details &&
      typeof body.details === 'object' &&
      !Array.isArray(body.details)
        ? (body.details as Record<string, unknown>)
        : status < 500 && Array.isArray(body.message)
          ? { issues: body.message }
          : {};
    const message =
      status >= 500
        ? status === 503
          ? 'Service unavailable'
          : status === 504
            ? 'Gateway timeout'
            : 'Internal server error'
        : typeof body.message === 'string'
          ? body.message
          : 'Request rejected';
    const errorResponse: ApiErrorResponse = {
      error: { code, message, details },
      requestId,
      timestamp: new Date().toISOString(),
    };

    response.setHeader('X-Request-Id', requestId);
    response.status(status).json(errorResponse);
  }
}
