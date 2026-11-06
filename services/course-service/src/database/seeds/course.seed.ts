import 'reflect-metadata';
import { ConfigModule } from '@nestjs/config';
import { DataSource } from 'typeorm';
import ids from '@lms/contracts/fixtures/ids.json';
import { databaseOptions, envFiles, validateEnvironment } from '../../config';
import { Course } from '../../courses/entities/course.entity';
import { seedFailureMessage } from './seed-error';

export async function seedCourse(source: DataSource): Promise<void> {
  if (!['development', 'test'].includes(process.env.NODE_ENV ?? ''))
    throw new Error('Course seed is development/test only');
  // Insert once: rerunning does not overwrite edits or API-created courses.
  await source
    .getRepository(Course)
    .createQueryBuilder()
    .insert()
    .values({
      id: ids.courses.draftCourse,
      instructorId: ids.users.instructorA,
      title: 'Course development fixture',
      description: 'Synthetic draft for local development',
      thumbnailUrl: null,
      status: 'DRAFT',
      version: 1,
      contentVersion: 1,
    })
    .orIgnore()
    .execute();
}

async function main(): Promise<void> {
  await ConfigModule.forRoot({
    envFilePath: envFiles,
    validate: validateEnvironment,
  });
  const env = validateEnvironment(process.env);
  if (!['development', 'test'].includes(String(env.NODE_ENV)))
    throw new Error('Course seed is development/test only');
  const source = new DataSource(
    databaseOptions(env) as import('typeorm').DataSourceOptions,
  );
  try {
    await source.initialize();
    await seedCourse(source);
    console.log('Course draft fixture is present');
  } finally {
    if (source.isInitialized) await source.destroy();
  }
}
if (require.main === module)
  void main().catch((error: unknown) => {
    console.error(seedFailureMessage(error));
    process.exitCode = 1;
  });
