import type { Uuid } from '../http/common';

export interface EventEnvelope<TType extends string, TPayload> {
  eventId: Uuid;
  eventType: TType;
  version: 1;
  occurredAt: string;
  producer: string;
  correlationId: string;
  payload: TPayload;
}
