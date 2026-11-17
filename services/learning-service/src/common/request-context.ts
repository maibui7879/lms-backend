import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export function requestContext(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const incoming = request.headers['x-request-id'];
  const id =
    typeof incoming === 'string' && /^[A-Za-z0-9._-]{1,128}$/.test(incoming)
      ? incoming
      : randomUUID();
  response.setHeader('X-Request-Id', id);
  next();
}

export function requestId(response: Response): string {
  return String(response.getHeader('X-Request-Id'));
}
