/** All timestamps are ISO 8601 UTC; all versions/revisions are positive integers. */
export type IsoDateTime = string;
export interface PageQuery {
  /** Default 1; integer >= 1. */
  page?: number;
  /** Default 20; integer 1..100. */
  limit?: number;
}
export interface PageData<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
}
export interface VersionRequest {
  expectedVersion: number;
}
export interface ReorderRequest extends VersionRequest {
  /** Complete permutation of siblings, no duplicates or foreign IDs. */
  orderedIds: string[];
}
export interface MutationHeaders {
  /** Required for start attempt, submit and certificate issuance. Scoped to actor + route. */
  'Idempotency-Key': string;
  'X-Request-Id'?: string;
}
