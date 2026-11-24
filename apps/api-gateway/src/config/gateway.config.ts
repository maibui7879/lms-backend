import { resolve } from 'node:path';

export const envFiles = [
  resolve(__dirname, '../../.env'),
  resolve(__dirname, '../../../../.env'),
];

export type GatewayService =
  'identity' | 'course' | 'quiz' | 'learning' | 'notification';

const ports = {
  identity: 3001,
  course: 3002,
  quiz: 3003,
  learning: 3004,
  notification: 3005,
};

export function targetFor(service: GatewayService): URL {
  const value = process.env[`${service.toUpperCase()}_URL`];
  if (!value && process.env.NODE_ENV === 'production')
    throw new Error(`Missing ${service} upstream`);
  const url = new URL(value || `http://127.0.0.1:${ports[service]}`);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error('Invalid upstream URL');
  return url;
}

export function proxyTimeout(): number {
  const value = Number(process.env.PROXY_TIMEOUT_MS ?? 3000);
  if (!Number.isInteger(value) || value < 50 || value > 30000)
    throw new Error('Invalid PROXY_TIMEOUT_MS');
  return value;
}

export function proxyRetries(): number {
  const value = Number(process.env.PROXY_RETRIES ?? 1);
  if (!Number.isInteger(value) || value < 0 || value > 2)
    throw new Error('Invalid PROXY_RETRIES');
  return value;
}

export function allowedOrigin(origin: string | undefined): boolean {
  return (
    !origin ||
    (
      process.env.GATEWAY_ALLOWED_ORIGINS ??
      'http://localhost:5173,http://localhost:3000'
    )
      .split(',')
      .map((value) => value.trim())
      .includes(origin)
  );
}
