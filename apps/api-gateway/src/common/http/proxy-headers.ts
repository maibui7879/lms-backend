import type { IncomingHttpHeaders, IncomingMessage } from 'node:http';

const HOP_HEADERS = [
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
];

export function stripHop(headers: IncomingHttpHeaders): IncomingHttpHeaders {
  const copy = { ...headers };
  for (const header of [
    ...HOP_HEADERS,
    ...(headers.connection ?? '')
      .split(',')
      .map((value) => value.trim().toLowerCase()),
  ])
    delete copy[header];
  return copy;
}

export function requestHeaders(
  req: IncomingMessage,
  id: string,
): IncomingHttpHeaders {
  const headers = stripHop(req.headers);
  for (const name of Object.keys(headers)) {
    if (
      name.startsWith('x-forwarded-') ||
      [
        'forwarded',
        'x-mock-user',
        'x-user-id',
        'x-user-role',
        'x-roles',
        'x-internal-api-key',
        'x-service-token',
      ].includes(name)
    )
      delete headers[name];
  }
  headers['x-request-id'] = id;
  return headers;
}
