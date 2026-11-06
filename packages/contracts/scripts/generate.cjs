// Derive runtime schemas and OpenAPI from TypeScript, without maintaining DTO copies.
const ts = require('typescript');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const root = path.resolve(__dirname, '..');
const config = ts.readConfigFile(
  path.join(root, 'tsconfig.json'),
  ts.sys.readFile,
);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
const program = ts.createProgram(
  parsed.fileNames.filter(
    (p) => !p.endsWith('validation.ts') && !p.endsWith('schema-types.ts'),
  ),
  parsed.options,
);
const checker = program.getTypeChecker();
const index = program.getSourceFile(path.join(root, 'src/index.ts'));
const exported = checker.getExportsOfModule(checker.getSymbolAtLocation(index));
const types = new Map();
for (const item of exported) {
  const symbol =
    item.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(item) : item;
  const declaration = symbol.declarations?.find(
    (d) => ts.isInterfaceDeclaration(d) || ts.isTypeAliasDeclaration(d),
  );
  if (
    !declaration ||
    declaration.typeParameters?.length ||
    ['SchemaTypes'].includes(item.name)
  )
    continue;
  types.set(item.name, checker.getDeclaredTypeOfSymbol(symbol));
}
const namedObjects = new Map(
  [...types]
    .filter(([, t]) => t.flags & ts.TypeFlags.Object)
    .map(([name, type]) => [type.id, name]),
);
function propertyRules(name, schema) {
  if (schema.type === 'string') {
    if (
      (name === 'id' || /Id$/.test(name)) &&
      !['requestId', 'correlationId'].includes(name)
    )
      schema.format = 'uuid';
    if (/At$/.test(name) || ['timestamp', 'serverTime'].includes(name))
      schema.format = 'date-time';
    if (name === 'email') {
      schema.format = 'email';
      schema.maxLength = 254;
    }
    if (
      [
        'title',
        'displayName',
        'prompt',
        'text',
        'reason',
        'body',
        'password',
        'refreshToken',
      ].includes(name)
    )
      schema.minLength = 1;
    if (['title', 'displayName'].includes(name)) schema.maxLength = 200;
    if (name === 'password') {
      schema.minLength = 12;
      schema.maxLength = 128;
    }
    if (/Url$/.test(name)) schema.format = 'uri';
  }
  if (schema.type === 'number') {
    schema.minimum = 0;
    if (/Percent$/.test(name)) schema.maximum = 100;
    if (
      [
        'page',
        'limit',
        'maxAttempts',
        'durationSeconds',
        'version',
        'contentVersion',
        'assessmentVersion',
        'expectedVersion',
        'revision',
        'expectedRevision',
        'order',
        'total',
        'responses',
        'correctResponses',
        'gradedAttempts',
        'evidenceCount',
        'enrolledCount',
        'completedCount',
      ].includes(name)
    )
      schema.type = 'integer';
    if (
      [
        'page',
        'limit',
        'maxAttempts',
        'durationSeconds',
        'version',
        'contentVersion',
        'assessmentVersion',
        'expectedVersion',
      ].includes(name)
    )
      schema.minimum = 1;
    if (name === 'limit') schema.maximum = 100;
    if (['maxScore', 'points', 'maxPoints'].includes(name))
      schema.exclusiveMinimum = 0;
  }
  if (schema.type === 'array' && /Ids$/.test(name)) {
    schema.uniqueItems = true;
    schema.items = { type: 'string', format: 'uuid' };
  }
  if (schema.anyOf) schema.anyOf.forEach((s) => propertyRules(name, s));
  return schema;
}
function schemaFor(type, expand = false) {
  if (!expand && namedObjects.has(type.id))
    return { $ref: `#/definitions/${namedObjects.get(type.id)}` };
  if (type.flags & ts.TypeFlags.Never) return false;
  if (type.flags & ts.TypeFlags.Undefined) return false;
  if (type.flags & ts.TypeFlags.Null) return { type: 'null' };
  if (type.flags & ts.TypeFlags.StringLiteral)
    return { type: 'string', const: type.value };
  if (type.flags & ts.TypeFlags.NumberLiteral)
    return { type: 'number', const: type.value };
  if (type.flags & ts.TypeFlags.BooleanLiteral)
    return { type: 'boolean', const: type.intrinsicName === 'true' };
  if (type.flags & ts.TypeFlags.String) return { type: 'string' };
  if (type.flags & ts.TypeFlags.Number) return { type: 'number' };
  if (type.flags & ts.TypeFlags.Boolean) return { type: 'boolean' };
  if (type.flags & (ts.TypeFlags.Unknown | ts.TypeFlags.Any)) return {};
  if (type.isUnion()) {
    const parts = type.types
      .filter((t) => !(t.flags & ts.TypeFlags.Undefined))
      .map((t) => schemaFor(t));
    return parts.length === 1 ? parts[0] : { anyOf: parts };
  }
  if (checker.isArrayType(type) || checker.isTupleType(type))
    return {
      type: 'array',
      items: schemaFor(checker.getTypeArguments(type)[0]),
    };
  if (type.flags & ts.TypeFlags.Object || type.isIntersection()) {
    const properties = {};
    const required = [];
    for (const p of checker.getPropertiesOfType(type)) {
      properties[p.name] = propertyRules(
        p.name,
        schemaFor(
          checker.getTypeOfSymbolAtLocation(
            p,
            p.valueDeclaration || p.declarations[0],
          ),
        ),
      );
      if (!(p.flags & ts.SymbolFlags.Optional)) required.push(p.name);
    }
    const indexType = checker.getIndexTypeOfType(type, ts.IndexKind.String);
    return {
      type: 'object',
      properties,
      ...(required.length ? { required } : {}),
      additionalProperties: indexType ? schemaFor(indexType) : false,
    };
  }
  throw new Error(`Unsupported contract type: ${checker.typeToString(type)}`);
}
const definitions = Object.fromEntries(
  [...types]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, type]) => [name, schemaFor(type, true)]),
);
definitions.Uuid.format = 'uuid';
definitions.IsoDateTime.format = 'date-time';
// Contract-specific shape constraints. Cross-record/domain rules live in validation.ts and README.
for (const name of [
  'CreateQuestionRequest',
  'UpdateQuestionRequest',
  'QuestionAuthoringDTO',
  'QuestionDeliveryDTO',
]) {
  definitions[name].properties.choices.minItems = 2;
  if (definitions[name].properties.correctChoiceIds)
    definitions[name].properties.correctChoiceIds.minItems = 1;
}
// Legacy v1 event envelopes accept additive fields during rolling upgrades.
for (const name of ['EnrollmentCreatedEvent', 'AttemptGradedEvent'])
  definitions[name].additionalProperties = true;
const endpointsPath = path.join(root, 'src/endpoints.ts');
const compiled = ts.transpileModule(fs.readFileSync(endpointsPath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const endpointModule = new Module(endpointsPath, module);
endpointModule._compile(compiled, endpointsPath);
const { ENDPOINTS } = endpointModule.exports;
const ref = (name) => {
  if (!definitions[name]) throw new Error(`Unknown schema ${name}`);
  return { $ref: `#/components/schemas/${name}` };
};
const paths = {};
const operationIds = new Set();
for (const e of ENDPOINTS) {
  if (operationIds.has(e.operationId))
    throw new Error(`Duplicate operation ${e.operationId}`);
  operationIds.add(e.operationId);
  let data = e.response ? ref(e.response) : null;
  if (e.list)
    data = {
      type: 'object',
      required: ['items', 'page', 'limit', 'total'],
      additionalProperties: false,
      properties: {
        items: { type: 'array', items: data },
        page: { type: 'integer', minimum: 1 },
        limit: { type: 'integer', minimum: 1, maximum: 100 },
        total: { type: 'integer', minimum: 0 },
      },
    };
  if (e.nullable) data = { anyOf: [data, { type: 'null' }] };
  const parameters = [...e.path.matchAll(/\{(\w+)\}/g)].map(([, name]) => ({
    name,
    in: 'path',
    required: true,
    schema:
      name === 'code'
        ? { type: 'string', minLength: 1 }
        : { type: 'string', format: 'uuid' },
  }));
  if (e.query) {
    ref(e.query);
    for (const [name, schema] of Object.entries(
      definitions[e.query].properties,
    ))
      parameters.push({
        name,
        in: 'query',
        required: definitions[e.query].required?.includes(name) || false,
        schema,
      });
  }
  if (e.idempotent)
    parameters.push({
      name: 'Idempotency-Key',
      in: 'header',
      required: true,
      schema: { type: 'string', minLength: 1, maxLength: 128 },
    });
  parameters.push({
    name: 'X-Request-Id',
    in: 'header',
    required: false,
    schema: { type: 'string', minLength: 1, maxLength: 128 },
  });
  const responses = {
    [e.success]: {
      description: 'Success',
      ...(data
        ? {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['data', 'meta'],
                  additionalProperties: false,
                  properties: { data, meta: ref('ApiMeta') },
                },
              },
            },
          }
        : {}),
    },
  };
  for (const status of [400, 401, 403, 404, 409, 422, 503, 504])
    responses[status] = {
      description: `See shared error rules (${status})`,
      content: { 'application/json': { schema: ref('ApiErrorResponse') } },
    };
  paths[e.path] ??= {};
  if (paths[e.path][e.method]) throw new Error(`Duplicate route ${e.path}`);
  paths[e.path][e.method] = {
    operationId: e.operationId,
    tags: [e.service],
    description: `Access policy: ${e.access}. See packages/contracts/README.md for ownership, state transitions and side effects.`,
    'x-access-policy': e.access,
    security:
      e.access === 'PUBLIC'
        ? []
        : e.access === 'INTERNAL'
          ? [{ serviceAuth: [] }]
          : [{ bearerAuth: [] }],
    parameters,
    responses,
    ...(e.request
      ? {
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref(e.request) } },
          },
        }
      : {}),
  };
}
function openapiRefs(value) {
  return JSON.parse(
    JSON.stringify(value).replaceAll('#/definitions/', '#/components/schemas/'),
  );
}
const api = openapiRefs({
  openapi: '3.1.0',
  info: {
    title: 'LMS contract baseline',
    version: '0.2.0',
    description:
      'Contract-first specification. Business endpoints are not implemented by this package. Owner review required for policy decisions.',
  },
  paths,
  components: {
    schemas: definitions,
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      serviceAuth: {
        type: 'http',
        scheme: 'bearer',
        description:
          'Separate service JWT: service issuer/audience/scope; never accept a public user token as a service credential.',
      },
    },
  },
});
function output(relative, content) {
  const target = path.join(root, relative);
  if (process.argv.includes('--check')) {
    if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== content)
      throw new Error(
        `Generated contract is stale: ${relative}; run npm run generate -w @lms/contracts`,
      );
  } else {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
}
output(
  'src/schemas.json',
  JSON.stringify(
    { $schema: 'http://json-schema.org/draft-07/schema#', definitions },
    null,
    2,
  ) + '\n',
);
output(
  'src/schema-types.ts',
  "// Generated by scripts/generate.cjs. Do not edit.\nimport type * as Contracts from './index';\nexport interface SchemaTypes {\n" +
    [...types.keys()]
      .sort()
      .map((name) => `  ${name}: Contracts.${name};`)
      .join('\n') +
    '\n}\n',
);
output('openapi.json', JSON.stringify(api, null, 2) + '\n');
for (const service of ['identity', 'course', 'quiz', 'learning'])
  output(
    `openapi/${service}.json`,
    JSON.stringify(
      {
        ...api,
        paths: Object.fromEntries(
          Object.entries(api.paths).filter(([, methods]) =>
            Object.values(methods).some((op) => op.tags.includes(service)),
          ),
        ),
      },
      null,
      2,
    ) + '\n',
  );
console.log(
  `${types.size} schemas; ${ENDPOINTS.length} operations; generated artifacts ${process.argv.includes('--check') ? 'current' : 'written'}.`,
);
