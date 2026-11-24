import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import type { OpenAPIObject } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const document = JSON.parse(
    readFileSync(
      resolve(
        __dirname,
        '../../../packages/contracts/openapi/notification.json',
      ),
      'utf8',
    ),
  ) as OpenAPIObject;
  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'docs-json',
    customSiteTitle: 'LMS Notification Service API',
  });
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT ?? 3005), '0.0.0.0');
}

void bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
