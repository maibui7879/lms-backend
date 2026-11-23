import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export function requestContext(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const incoming = request.headers['x-request-id'];
  const requestId =
    typeof incoming === 'string' && /^[A-Za-z0-9._-]{1,128}$/.test(incoming)
      ? incoming
      : randomUUID();

  request.headers['x-request-id'] = requestId;
  response.setHeader('X-Request-Id', requestId);
  next();
}
