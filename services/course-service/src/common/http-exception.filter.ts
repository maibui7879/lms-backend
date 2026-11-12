import { Catch, HttpException } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

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
    const codes: Record<number, string> = {
      400: 'VALIDATION_ERROR',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'VERSION_CONFLICT',
      503: 'SERVICE_UNAVAILABLE',
    };
    const requestId = String(request.headers['x-request-id'] ?? randomUUID());
    response.setHeader('X-Request-Id', requestId);
    response.status(status).json({
      error: {
        code:
          typeof body.code === 'string'
            ? body.code
            : (codes[status] ?? 'INTERNAL_ERROR'),
        message:
          status >= 500
            ? status === 503
              ? 'Service unavailable'
              : 'Internal server error'
            : typeof body.message === 'string'
              ? body.message
              : 'Request rejected',
        details:
          status < 500 && body.details && typeof body.details === 'object'
            ? body.details
            : {},
      },
      requestId,
      timestamp: new Date().toISOString(),
    });
  }
}
