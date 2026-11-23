import { validateRequest } from './validate-request';

export function pageQuery(query: Record<string, unknown>) {
  const normalized = { ...query };
  for (const key of ['page', 'limit']) {
    const value = normalized[key];
    if (typeof value === 'string' && /^[0-9]+$/.test(value)) {
      const parsed = Number(value);
      if (Number.isSafeInteger(parsed)) normalized[key] = parsed;
    }
  }
  const { page = 1, limit = 20 } = validateRequest('PageQuery', normalized);
  return { page, limit };
}
