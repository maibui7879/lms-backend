import type { ServerResponse } from 'node:http';

export function gatewayError(
  res: ServerResponse,
  status: number,
  code: string,
  message: string,
  id: string,
): void {
  if (res.headersSent) {
    res.destroy();
    return;
  }
  res.statusCode = status;
  res.setHeader('x-request-id', id);
  res.setHeader('content-type', 'application/json');
  res.end(
    JSON.stringify({
      error: { code, message, details: {} },
      meta: { requestId: id },
    }),
  );
}
