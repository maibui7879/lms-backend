import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  DOMAIN_EVENT_ROUTING_KEYS,
  ENROLLMENT_CREATED_V2_ROUTING_KEY,
  parseContract,
} from '@lms/contracts';
import type {
  EnrollmentSnapshotData,
  EnrollmentCancelledPayload,
} from '@lms/contracts';
import type { EntityManager } from 'typeorm';
import { EnrollmentOutboxEvent } from './enrollment-outbox.entity';

/** The caller must pass the manager of the enrollment write transaction. */
@Injectable()
export class EnrollmentOutboxService {
  created(
    manager: EntityManager,
    payload: EnrollmentSnapshotData,
    correlationId: string,
  ) {
    const event = parseContract('EnrollmentCreatedV2Event', {
      eventId: randomUUID(),
      eventType: 'course.enrollment.created',
      version: 2,
      occurredAt: payload.enrolledAt,
      producer: 'course-service',
      correlationId,
      payload,
    });
    return this.save(manager, ENROLLMENT_CREATED_V2_ROUTING_KEY, event);
  }

  cancelled(
    manager: EntityManager,
    payload: EnrollmentCancelledPayload,
    correlationId: string,
  ) {
    const event = parseContract('EnrollmentCancelledEvent', {
      eventId: randomUUID(),
      eventType: 'course.enrollment.cancelled',
      version: 1,
      occurredAt: payload.cancelledAt,
      producer: 'course-service',
      correlationId,
      payload,
    });
    return this.save(
      manager,
      DOMAIN_EVENT_ROUTING_KEYS.enrollmentCancelled,
      event,
    );
  }

  private save(
    manager: EntityManager,
    routingKey: string,
    event: EnrollmentOutboxEvent['event'],
  ) {
    if (!manager.queryRunner?.isTransactionActive)
      throw new Error('Enrollment outbox requires an active transaction');
    return manager.insert(EnrollmentOutboxEvent, {
      id: event.eventId,
      routingKey,
      event,
      createdAt: new Date(event.occurredAt),
      sentAt: null,
    });
  }
}
