import type { GradedAssessmentSummary } from '../internal/integration';
import type { Uuid } from '../http/common';

export const ATTEMPT_GRADED_V2_EVENT = 'quiz.attempt.graded' as const;
export const ATTEMPT_GRADED_V2_ROUTING_KEY = 'quiz.attempt.graded.v2' as const;
/** New version rather than silently changing the v1 payload required by Learning. */
export interface AttemptGradedV2Event {
  eventId: Uuid;
  eventType: typeof ATTEMPT_GRADED_V2_EVENT;
  version: 2;
  occurredAt: string;
  producer: 'quiz-service';
  correlationId: string;
  payload: GradedAssessmentSummary;
}
