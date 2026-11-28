import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { OpenAPIObject } from '@nestjs/swagger';
import { buildGatewayDocument } from './gateway-document';
import { gatewayRoutes } from '../routing/routes';

describe('Gateway documentation mirrors implemented routes', () => {
  const contract = JSON.parse(
    readFileSync(
      resolve(__dirname, '../../../../packages/contracts/openapi.json'),
      'utf8',
    ),
  ) as OpenAPIObject;

  it('documents every mapped operation and no planned or internal operation', () => {
    const document = buildGatewayDocument(contract);
    const operations = Object.values(document.paths).reduce(
      (count, methods) => count + Object.keys(methods ?? {}).length,
      0,
    );
    expect(operations).toBe(gatewayRoutes.length);
    for (const route of gatewayRoutes)
      expect(document.paths[route.path]?.[route.method as 'get']).toBeDefined();
    expect(document.paths['/api/v1/quizzes']).toBeUndefined();
    expect(document.paths['/api/v1/courses/{id}/assessments']).toBeUndefined();
    expect(
      Object.keys(document.paths).some((path) =>
        path.startsWith('/api/v1/internal/'),
      ),
    ).toBe(false);
  });

  it('includes Identity-only endpoints with request fields from implemented DTOs', () => {
    const document = buildGatewayDocument(contract);
    const operation = document.paths['/api/v1/auth/verify-email']!.post!;
    expect(operation.requestBody).toMatchObject({
      content: {
        'application/json': {
          schema: {
            required: ['email', 'otp'],
            properties: {
              email: { type: 'string', format: 'email' },
              otp: { type: 'string' },
            },
          },
        },
      },
    });
    expect(operation.security).toEqual([]);
    expect(document.paths['/api/v1/users/me/password']!.post).toBeDefined();
    expect(
      document.paths['/api/v1/users/me/role-requests']!.post?.requestBody,
    ).toMatchObject({
      content: { 'application/json': { schema: { required: ['reason'] } } },
    });
  });

  it('retains response schemas for matching implemented operations without mutating contracts', () => {
    const before = JSON.stringify(contract);
    const document = buildGatewayDocument(contract);
    expect(
      document.paths['/api/v1/notifications']!.get?.responses['200'],
    ).toHaveProperty('content');
    expect(JSON.stringify(contract)).toBe(before);
  });
});
