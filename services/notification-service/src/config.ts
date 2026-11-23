import { resolve } from 'node:path';
import type { DataSourceOptions } from 'typeorm';
import { Notification } from './modules/notifications/notification.entity';
import { Notifications1795478400000 } from './database/migrations/1795478400000-notifications';
export const envFiles = [
  resolve(__dirname, '../.env'),
  resolve(__dirname, '../../../.env'),
];
export function validateEnvironment(
  env: Record<string, unknown>,
): Record<string, unknown> {
  if (typeof env.DATABASE_URL !== 'string')
    throw new Error('DATABASE_URL is required');
  const url = new URL(env.DATABASE_URL);
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !url.hostname ||
    !url.pathname.slice(1)
  )
    throw new Error('DATABASE_URL must be a PostgreSQL URL');
  if (
    env.PORT !== undefined &&
    typeof env.PORT !== 'string' &&
    typeof env.PORT !== 'number'
  )
    throw new Error('Invalid PORT');
  const port = String(env.PORT ?? 3005);
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535)
    throw new Error('Invalid PORT');
  return { ...env, PORT: Number(port) };
}
export function databaseOptions(
  env: Record<string, unknown>,
): DataSourceOptions {
  const config = validateEnvironment(env);
  return {
    type: 'postgres',
    url: config.DATABASE_URL as string,
    schema: 'notification',
    entities: [Notification],
    migrations: [Notifications1795478400000],
    synchronize: false,
    logging: false,
    extra: { connectionTimeoutMillis: 10000, statement_timeout: 5000 },
  };
}
