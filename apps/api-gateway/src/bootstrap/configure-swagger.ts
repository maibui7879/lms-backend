import type { INestApplication } from '@nestjs/common';
import { SwaggerModule } from '@nestjs/swagger';
import type { OpenAPIObject } from '@nestjs/swagger';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function configureSwagger(app: INestApplication): void {
  const document = JSON.parse(
    readFileSync(
      resolve(__dirname, '../../../../packages/contracts/openapi.json'),
      'utf8',
    ),
  ) as OpenAPIObject;
  // Internal S2S endpoints are intentionally absent from public Gateway docs.
  document.paths = Object.fromEntries(
    Object.entries(document.paths).filter(
      ([path]) => !path.startsWith('/api/v1/internal/'),
    ),
  );
  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'docs-json',
    customSiteTitle: 'LMS API Gateway',
  });
}
