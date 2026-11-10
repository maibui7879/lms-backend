import Ajv from 'ajv';
import type { ValidateFunction } from 'ajv';
import schemas from './schemas.json';
import type { SchemaTypes } from './schema-types';

const ajv = new Ajv({
  allErrors: true,
  strict: false,
  coerceTypes: false,
  removeAdditional: false,
});
ajv.addFormat(
  'uuid',
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
);
ajv.addFormat(
  'date-time',
  (s: string) =>
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(s) &&
    Number.isFinite(Date.parse(s)) &&
    new Date(s).toISOString().slice(0, 19) === s.slice(0, 19),
);
ajv.addFormat('email', /^[^\s@]+@[^\s@]+\.[^\s@]+$/);
ajv.addFormat('uri', (s: string) => {
  try {
    const url = new URL(s);
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
});
ajv.addSchema(schemas, 'lms');
const validators = new Map<string, ValidateFunction>();

export class ContractValidationError extends Error {
  readonly code = 'VALIDATION_ERROR';
  constructor(
    readonly schemaName: string,
    readonly issues: readonly string[],
  ) {
    super(`Invalid ${schemaName}: ${issues.join('; ')}`);
    this.name = 'ContractValidationError';
  }
}

/** Pure payload validation only. Ownership, database relationships, deadlines and
 * state transitions must additionally be enforced by the service transaction. */
export function parseContract<K extends keyof SchemaTypes>(
  name: K,
  value: unknown,
): SchemaTypes[K] {
  let validate = validators.get(name);
  if (!validate) {
    validate = ajv.compile({ $ref: `lms#/definitions/${name}` });
    validators.set(name, validate);
  }
  if (!validate(value))
    throw new ContractValidationError(
      name,
      (validate.errors ?? []).map(
        (e) => `${e.instancePath || '/'} ${e.message}`,
      ),
    );
  const issues: string[] = [];
  function inspect(input: unknown, location: string): void {
    if (input === null || typeof input !== 'object') return;
    if (Array.isArray(input)) {
      input.forEach((v, i) => inspect(v, `${location}/${i}`));
      return;
    }
    const row = input as Record<string, unknown>;
    for (const [key, item] of Object.entries(row)) {
      if (
        typeof item === 'string' &&
        ['title', 'displayName', 'prompt', 'text', 'reason', 'body'].includes(
          key,
        ) &&
        !item.trim()
      )
        issues.push(`${location}/${key} must not be blank`);
      if (key !== 'details') inspect(item, `${location}/${key}`);
    }
    if (row.quizType === 'PRACTICE' && row.requiredForCompletion === true)
      issues.push(
        `${location} practice cannot be a required graded assessment`,
      );
    if (Array.isArray(row.choices)) {
      const ids = row.choices.map((c: { id: string }) => c.id);
      if (new Set(ids).size !== ids.length)
        issues.push(`${location} choice IDs must be unique`);
      if (Array.isArray(row.correctChoiceIds)) {
        if (row.correctChoiceIds.some((id) => !ids.includes(id)))
          issues.push(`${location} correct choices must belong to question`);
        if (row.type === 'SINGLE_CHOICE' && row.correctChoiceIds.length !== 1)
          issues.push(
            `${location} single choice requires exactly one correct answer`,
          );
      }
    }
    if (Array.isArray(row.answers)) {
      const ids = row.answers.map((a: { questionId: string }) => a.questionId);
      if (new Set(ids).size !== ids.length)
        issues.push(`${location} duplicate question answers`);
    }
    if (typeof row.score === 'number' && typeof row.maxScore === 'number') {
      if (row.score > row.maxScore)
        issues.push(`${location} score exceeds maxScore`);
      if (
        typeof row.passingScorePercent === 'number' &&
        row.passed !==
          (row.score / row.maxScore) * 100 >= row.passingScorePercent
      )
        issues.push(`${location} passed disagrees with score and policy`);
    }
    if (row.gradingStatus === 'GRADED' && row.attemptStatus === 'IN_PROGRESS')
      issues.push(`${location} in-progress attempt cannot be graded`);
    if (row.status === 'FAILED' && row.attemptId && !row.error)
      issues.push(`${location} failed sync requires a public error`);
    if (
      row.status === 'SYNCED' &&
      row.attemptId &&
      (!row.eventId || !row.updatedAt || row.error)
    )
      issues.push(
        `${location} synced requires eventId, updatedAt and no error`,
      );
    if (
      Array.isArray(row.requiredItemIds) &&
      Array.isArray(row.requiredAssessments) &&
      row.requiredItemIds.length + row.requiredAssessments.length === 0
    )
      issues.push(
        `${location} empty completion requirements cannot be published`,
      );
  }
  inspect(value, '');
  if (issues.length) throw new ContractValidationError(name, issues);
  return value as SchemaTypes[K];
}
