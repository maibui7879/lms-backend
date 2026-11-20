import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import type { OpenAPIObject } from '@nestjs/swagger';
import { AppModule } from './app.module';

function loadCourseOpenApiDocument(): OpenAPIObject {
  const contractPath = resolve(
    __dirname,
    '../../../packages/contracts/openapi/course.json',
  );

  return JSON.parse(readFileSync(contractPath, 'utf8')) as OpenAPIObject;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  SwaggerModule.setup('docs', app, loadCourseOpenApiDocument(), {
    jsonDocumentUrl: 'docs-json',
    customSiteTitle: 'LMS Course Service API',
  });

  const port = Number(process.env.PORT ?? 3002);

  await app.listen(port, '0.0.0.0');
}

bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
