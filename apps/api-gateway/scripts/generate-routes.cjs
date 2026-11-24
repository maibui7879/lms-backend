// Inspect registered Nest controllers; contracts enrich documentation, never create routes.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../../..');
const services = ['identity', 'course', 'learning', 'notification', 'quiz'];
const files = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (file.endsWith('.ts') && !file.endsWith('.spec.ts'))
      files.push(file);
  }
}
for (const service of services)
  walk(path.join(root, `services/${service}-service/src`));
const program = ts.createProgram(files, {
  target: ts.ScriptTarget.ES2023,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  experimentalDecorators: true,
  esModuleInterop: true,
  skipLibCheck: true,
  strictNullChecks: true,
});
const checker = program.getTypeChecker();
const decorators = (node) =>
  (ts.canHaveDecorators(node) ? ts.getDecorators(node) : []) ?? [];
const decorator = (node, name) =>
  decorators(node)
    .map((d) => d.expression)
    .find((e) => ts.isCallExpression(e) && e.expression.getText() === name);
const registered = new Set();
for (const file of files.filter((file) => file.endsWith('.module.ts'))) {
  const source = program.getSourceFile(file);
  function visit(node) {
    if (
      ts.isPropertyAssignment(node) &&
      node.name.getText(source) === 'controllers' &&
      ts.isArrayLiteralExpression(node.initializer)
    ) {
      for (const controller of node.initializer.elements) {
        let symbol = checker.getSymbolAtLocation(controller);
        if (symbol?.flags & ts.SymbolFlags.Alias)
          symbol = checker.getAliasedSymbol(symbol);
        if (symbol) registered.add(symbol);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}
function schemaFor(type, depth = 0) {
  if (depth > 4) return {};
  if (type.isUnion()) {
    const types = type.types.filter(
      (t) => !(t.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null)),
    );
    if (types.length === 1) return schemaFor(types[0], depth);
    if (types.every((t) => t.isStringLiteral()))
      return { type: 'string', enum: types.map((t) => t.value) };
    if (types.every((t) => t.flags & ts.TypeFlags.BooleanLiteral))
      return { type: 'boolean' };
    return { anyOf: types.map((t) => schemaFor(t, depth + 1)) };
  }
  if (type.isStringLiteral()) return { type: 'string', enum: [type.value] };
  if (type.flags & ts.TypeFlags.StringLike) return { type: 'string' };
  if (type.flags & ts.TypeFlags.NumberLike) return { type: 'number' };
  if (type.flags & ts.TypeFlags.BooleanLike) return { type: 'boolean' };
  if (checker.isArrayType(type))
    return {
      type: 'array',
      items: schemaFor(checker.getTypeArguments(type)[0], depth + 1),
    };
  if (!(type.flags & ts.TypeFlags.Object)) return {};
  const properties = {},
    required = [];
  for (const property of type.getProperties()) {
    const declaration = property.valueDeclaration ?? property.declarations?.[0];
    if (!declaration || ts.isMethodDeclaration(declaration)) continue;
    const schema = schemaFor(
      checker.getTypeOfSymbolAtLocation(property, declaration),
      depth + 1,
    );
    for (const [name, target] of [
      ['MinLength', 'minLength'],
      ['MaxLength', 'maxLength'],
      ['Min', 'minimum'],
      ['Max', 'maximum'],
    ]) {
      const value = decorator(declaration, name)?.arguments[0];
      if (value && ts.isNumericLiteral(value))
        schema[target] = Number(value.text);
    }
    if (decorator(declaration, 'IsEmail')) schema.format = 'email';
    if (decorator(declaration, 'IsInt')) schema.type = 'integer';
    properties[property.name] = schema;
    if (
      !(property.flags & ts.SymbolFlags.Optional) &&
      !decorator(declaration, 'IsOptional')
    )
      required.push(property.name);
  }
  return {
    type: 'object',
    properties,
    ...(required.length ? { required } : {}),
  };
}
const routes = [];
for (const file of files.filter((file) => file.endsWith('.controller.ts'))) {
  const service = services.find((service) =>
    file.includes(path.join('services', `${service}-service`, 'src')),
  );
  const source = program.getSourceFile(file);
  for (const controller of source.statements.filter(ts.isClassDeclaration)) {
    if (!registered.has(checker.getSymbolAtLocation(controller.name))) continue;
    const prefixArg = decorator(controller, 'Controller')?.arguments[0];
    const prefix =
      prefixArg && ts.isStringLiteralLike(prefixArg) ? prefixArg.text : '';
    for (const member of controller.members.filter(ts.isMethodDeclaration)) {
      const method = [
        'Get',
        'Post',
        'Put',
        'Patch',
        'Delete',
        'Head',
        'Options',
      ].find((name) => decorator(member, name));
      if (!method) continue;
      const suffixArg = decorator(member, method).arguments[0];
      const suffix =
        suffixArg && ts.isStringLiteralLike(suffixArg) ? suffixArg.text : '';
      const fullPath =
        '/' +
        [prefix, suffix]
          .filter(Boolean)
          .join('/')
          .replace(/^\/+|\/+$/g, '');
      if (
        !fullPath.startsWith('/api/v1/') ||
        fullPath.startsWith('/api/v1/internal/')
      )
        continue;
      const guards = [
        decorator(controller, 'UseGuards'),
        decorator(member, 'UseGuards'),
      ]
        .filter(Boolean)
        .flatMap((d) => d.arguments.map((arg) => arg.getText(source)));
      const protectedRoute = guards.some(
        (guard) => !['RateLimitGuard'].includes(guard),
      );
      const access =
        decorator(member, 'Public') || !protectedRoute
          ? 'PUBLIC'
          : fullPath.startsWith('/api/v1/admin/')
            ? 'ADMIN'
            : 'AUTHENTICATED';
      const codeArg = decorator(member, 'HttpCode')?.arguments[0];
      const code = codeArg && checker.getTypeAtLocation(codeArg).value;
      const route = {
        service,
        method: method.toLowerCase(),
        path: fullPath.replace(/:([A-Za-z][A-Za-z0-9_]*)/g, '{$1}'),
        access,
        operationId: `${service}_${controller.name.text}_${member.name.getText(source)}`,
        success:
          typeof code === 'number' ? code : method === 'Post' ? 201 : 200,
      };
      for (const parameter of member.parameters) {
        const type = checker.getTypeAtLocation(parameter.type ?? parameter);
        if (decorator(parameter, 'Body')) route.bodySchema = schemaFor(type);
        const query = decorator(parameter, 'Query');
        if (query) {
          const schema = schemaFor(type);
          const name = query.arguments[0];
          if (name && ts.isStringLiteralLike(name)) {
            route.querySchema ??= { type: 'object', properties: {} };
            route.querySchema.properties[name.text] = schema;
          } else if (Object.keys(schema.properties ?? {}).length)
            route.querySchema = schema;
        }
      }
      routes.push(route);
    }
  }
}
routes.sort(
  (a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method),
);
const keys = new Set();
for (const route of routes) {
  const key = route.method + ' ' + route.path.replace(/\{[^}]+\}/g, '{}');
  if (keys.has(key)) throw Error('Ambiguous implemented route: ' + key);
  keys.add(key);
}
const output = path.join(
  root,
  'apps/api-gateway/src/routing/implemented-routes.json',
);
const content = JSON.stringify(routes, null, 2) + '\n';
if (process.argv.includes('--check')) {
  if (!fs.existsSync(output) || fs.readFileSync(output, 'utf8') !== content)
    throw Error(
      'Gateway routes stale: run npm run routes:generate -w @lms/api-gateway',
    );
} else fs.writeFileSync(output, content);
console.log(
  `${routes.length} implemented public routes; ${routes.filter((route) => route.service === 'quiz').length} Quiz business routes.`,
);
