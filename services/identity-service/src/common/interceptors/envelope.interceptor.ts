import {
  CallHandler,
  ExecutionContext,
  HttpStatus,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class EnvelopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    if (req.url.startsWith('/health') || req.url.startsWith('/docs')) {
      return next.handle();
    }

    const requestId = String(req.headers['x-request-id'] ?? '');

    return next.handle().pipe(
      map((payload: unknown) => {
        if (res.statusCode === HttpStatus.NO_CONTENT) {
          return undefined;
        }

        if (
          payload &&
          typeof payload === 'object' &&
          'data' in payload &&
          'meta' in payload
        ) {
          return payload;
        }

        return {
          data: payload ?? null,
          meta: { requestId },
        };
      }),
    );
  }
}