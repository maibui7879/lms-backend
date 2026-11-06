import type { Uuid } from '../http/common';

export interface EventEnvelope<
  TType extends string,
  TPayload,
  TVersion extends number = 1,
> {
  eventId: Uuid;
  eventType: TType;
  version: TVersion;
  occurredAt: string;
  producer: string;
  correlationId: string;
  payload: TPayload;
}
