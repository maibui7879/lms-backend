import type {
  OpenAPIObject,
  OperationObject,
  ParameterObject,
  SchemaObject,
} from '@nestjs/swagger';
import { gatewayRoutes } from '../routing/routes';

const shape = (path: string): string => path.replace(/\{[^}]+\}/g, '{}');

/** The controller manifest controls exposure; contracts only supply existing schemas. */
export function buildGatewayDocument(contract: OpenAPIObject): OpenAPIObject {
  const document = structuredClone(contract);
  document.paths = {};
  document.info.title = 'LMS API Gateway';
  document.info.description =
    'Các API public đang được triển khai trong controller của Identity, Course, Learning và Notification. Không công bố API Quiz dự kiến hoặc API internal. Endpoint chưa đồng bộ contract vẫn được định tuyến; schema chưa có sẽ không được tự suy đoán.';

  for (const route of gatewayRoutes) {
    const matchedPath = Object.keys(contract.paths).find(
      (path) => shape(path) === shape(route.path),
    );
    const existing = matchedPath
      ? (contract.paths[matchedPath]?.[route.method as 'get'] as
          OperationObject | undefined)
      : undefined;
    const matched = existing?.tags?.includes(route.service)
      ? existing
      : undefined;
    const operation: OperationObject = matched
      ? structuredClone(matched)
      : {
          operationId: route.operationId,
          summary: `${route.method.toUpperCase()} ${route.path}`,
          description:
            'API đã triển khai trong service. Schema phản hồi chưa được đồng bộ vào contract.',
          responses: {},
        };

    operation.tags = [route.service];
    operation.security = route.access === 'PUBLIC' ? [] : [{ bearerAuth: [] }];
    operation.description = `Quyền truy cập tại Gateway: ${route.access}. ${operation.description ?? ''}`;
    const pathNames = [...route.path.matchAll(/\{([^}]+)\}/g)].map(
      (match) => match[1],
    );
    const oldPathParameters = (operation.parameters ?? []).filter(
      (parameter) => 'in' in parameter && parameter.in === 'path',
    ) as ParameterObject[];
    const parameters = (operation.parameters ?? []).filter(
      (parameter) => !('in' in parameter) || parameter.in !== 'path',
    );
    parameters.push(
      ...pathNames.map((name, index): ParameterObject => ({
        ...(oldPathParameters[index] ?? { schema: { type: 'string' } }),
        name,
        in: 'path',
        required: true,
      })),
    );
    if (route.querySchema) {
      operation.parameters = parameters.filter(
        (parameter) => !('in' in parameter) || parameter.in !== 'query',
      );
      operation.parameters.push(
        ...Object.entries(route.querySchema.properties).map(
          ([name, schema]): ParameterObject => ({
            name,
            in: 'query',
            required: route.querySchema?.required?.includes(name) ?? false,
            schema: schema as SchemaObject,
          }),
        ),
      );
    } else operation.parameters = parameters;

    // DTOs are authoritative for Identity, including endpoints missing from the contract.
    if (route.bodySchema && (!matched || route.service === 'identity')) {
      operation.requestBody = {
        required: true,
        content: {
          'application/json': { schema: route.bodySchema as SchemaObject },
        },
      };
    }
    const success = operation.responses?.[String(route.success)] ?? {
      description: 'Thành công.',
    };
    operation.responses = { [route.success]: success };
    document.paths[route.path] ??= {};
    Object.assign(document.paths[route.path]!, { [route.method]: operation });
  }

  const schemas = contract.components?.schemas ?? {};
  const used = new Set<string>();
  function collect(value: unknown): void {
    if (!value || typeof value !== 'object') return;
    const reference = (value as { $ref?: string }).$ref;
    const prefix = '#/components/schemas/';
    if (reference?.startsWith(prefix)) {
      const name = reference.slice(prefix.length);
      if (!used.has(name)) {
        used.add(name);
        collect(schemas[name]);
      }
    }
    for (const child of Object.values(value)) collect(child);
  }
  collect(document.paths);
  if (document.components) {
    document.components.schemas = Object.fromEntries(
      Object.entries(schemas).filter(([name]) => used.has(name)),
    );
    document.components.securitySchemes = {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    };
  }
  return document;
}
