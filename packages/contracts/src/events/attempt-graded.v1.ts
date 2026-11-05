import type { Uuid } from '../http/common';
import type { EventEnvelope } from './envelope';

export const ATTEMPT_GRADED_EVENT = 'quiz.attempt.graded' as const;
export const ATTEMPT_GRADED_ROUTING_KEY = 'quiz.attempt.graded.v1' as const;

export interface AttemptGradedPayload {
  attemptId: Uuid;
  quizId: Uuid;
  courseId: Uuid;
  userId: Uuid;
  score: number;
  maxScore: number;
  passed: boolean;
}

export type AttemptGradedEvent = EventEnvelope<
  typeof ATTEMPT_GRADED_EVENT,
  AttemptGradedPayload
>;
