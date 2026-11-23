import type { CourseMetadata, CourseQuery } from '@lms/contracts';
import { Raw } from 'typeorm';

const metadataKeys = [
  'subtitle',
  'category',
  'tags',
  'level',
  'language',
  'prerequisites',
  'targetAudience',
  'learningOutcomes',
  'descriptionFormat',
] as const satisfies readonly (keyof CourseMetadata)[];

export function courseMetadata(input: CourseMetadata): CourseMetadata {
  return Object.fromEntries(
    metadataKeys
      .filter((key) => input[key] !== undefined)
      .map((key) => [key, input[key]]),
  );
}

export function courseMetadataFilter(query: CourseQuery) {
  const filters = {
    ...(query.category !== undefined ? { category: query.category } : {}),
    ...(query.tag !== undefined ? { tags: [query.tag] } : {}),
    ...(query.level !== undefined ? { level: query.level } : {}),
    ...(query.language !== undefined ? { language: query.language } : {}),
  };
  return Object.keys(filters).length
    ? {
        metadata: Raw((alias) => `${alias} @> CAST(:courseMetadata AS jsonb)`, {
          courseMetadata: JSON.stringify(filters),
        }),
      }
    : {};
}
