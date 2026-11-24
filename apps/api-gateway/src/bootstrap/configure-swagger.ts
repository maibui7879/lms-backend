import type { INestApplication } from '@nestjs/common';
import { SwaggerModule } from '@nestjs/swagger';
import type { OpenAPIObject } from '@nestjs/swagger';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildGatewayDocument } from './gateway-document';

export function configureSwagger(app: INestApplication): void {
  const document = JSON.parse(
    readFileSync(
      resolve(__dirname, '../../../../packages/contracts/openapi.json'),
      'utf8',
    ),
  ) as OpenAPIObject;
  SwaggerModule.setup('docs', app, buildGatewayDocument(document), {
    jsonDocumentUrl: 'docs-json',
    customSiteTitle: 'LMS API Gateway',
  });
}
