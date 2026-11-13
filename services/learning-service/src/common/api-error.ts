import { Catch, HttpException } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { ERROR_HTTP_STATUS } from '@lms/contracts';
import type { ApiErrorResponse, DomainErrorCode } from '@lms/contracts';
import type { Response } from 'express';
import { requestId } from './request-context';

export function apiError(
  code: DomainErrorCode,
  message: string,
  details: Record<string, unknown> = {},
): HttpException {
  return new HttpException({ code, message, details }, ERROR_HTTP_STATUS[code]);
}

@Catch(HttpException)
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = exception.getStatus();
    const payload = exception.getResponse();
    const defaultCodes: Partial<Record<number, DomainErrorCode>> = {
      400: 'VALIDATION_ERROR',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      500: 'INTERNAL_ERROR',
    };
    const body = typeof payload === 'string' ? { message: payload } : payload;
    const { code, message, details } = body as Partial<
      ApiErrorResponse['error']
    >;
    response.status(status).json({
      error: {
        code: code ?? defaultCodes[status] ?? 'INTERNAL_ERROR',
        message: message ?? 'Request rejected',
        details: details ?? {},
      },
      requestId: requestId(response),
      timestamp: new Date().toISOString(),
    } satisfies ApiErrorResponse);
  }
}
