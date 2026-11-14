import { resolve } from 'node:path';
import type { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { Course } from './modules/courses/entities/course.entity';
import { Chapter } from './modules/chapters/entities/chapter.entity';
import { Lesson } from './modules/lessons/entities/lesson.entity';
import { LearningItem } from './modules/learning-items/entities/learning-item.entity';
import { CompletionPolicy } from './modules/completion-policy/entities/completion-policy.entity';
import { Enrollment } from './modules/enrollments/entities/enrollment.entity';
import { CourseReview } from './modules/course-revisions/entities/course-review.entity';
import { CourseRevision } from './modules/course-revisions/entities/course-revision.entity';

export const envFiles = [
  resolve(__dirname, '../.env'),
  resolve(__dirname, '../../../.env'),
];

export function validateEnvironment(
  env: Record<string, unknown>,
): Record<string, unknown> {
  const mode = env.NODE_ENV ?? 'development';
  if (
    typeof mode !== 'string' ||
    !['development', 'test', 'staging', 'production'].includes(mode)
  )
    throw new Error('Invalid NODE_ENV');
  for (const key of ['DB_SYNC', 'MOCK_AUTH']) {
    if (env[key] !== undefined && env[key] !== 'true' && env[key] !== 'false')
      throw new Error(`${key} must be true or false`);
  }
  if (env.DB_SYNC === 'true' && mode !== 'development')
    throw new Error('DB_SYNC requires development');
  if (env.MOCK_AUTH === 'true' && !['development', 'test'].includes(mode))
    throw new Error('Mock auth requires development/test');
  try {
    if (typeof env.DATABASE_URL !== 'string') throw new Error();
    const url = new URL(env.DATABASE_URL);
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      !url.hostname ||
      !url.pathname.slice(1)
    )
      throw new Error();
  } catch {
    throw new Error('DATABASE_URL must be a PostgreSQL connection URL');
  }
  if (new URL(env.DATABASE_URL as string).hostname.toLowerCase() === 'host')
    throw new Error('DATABASE_URL still contains the HOST placeholder');
  if (
    env.PORT !== undefined &&
    typeof env.PORT !== 'string' &&
    typeof env.PORT !== 'number'
  )
    throw new Error('Invalid PORT');
  const port = String(env.PORT ?? '3002');
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535)
    throw new Error('Invalid PORT');
  return { ...env, NODE_ENV: mode, PORT: Number(port) };
}

export function databaseOptions(
  env: Record<string, unknown>,
): TypeOrmModuleOptions & { type: 'postgres'; url: string } {
  const config = validateEnvironment(env);
  return {
    type: 'postgres',
    url: config.DATABASE_URL as string,
    entities: [
      Course,
      Chapter,
      Lesson,
      LearningItem,
      CompletionPolicy,
      Enrollment,
      CourseReview,
      CourseRevision,
    ],
    synchronize: config.DB_SYNC === 'true',
    retryAttempts: 1,
    // Keep TLS parameters from the provider URL; never disable certificate verification here.
    logging: false,
    extra: { connectionTimeoutMillis: 10000 },
  };
}
