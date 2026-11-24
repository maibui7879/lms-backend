import { createNotification } from './create-notification';

describe('Course review notification mapping', () => {
  const id = '11111111-1111-4111-8111-111111111111';

  it.each([
    ['APPROVE', null, 'COURSE_APPROVED'],
    ['REJECT', null, 'COURSE_REJECTED'],
    ['APPROVE', id, 'REVISION_APPROVED'],
    ['REJECT', id, 'REVISION_REJECTED'],
  ])('maps decision %s and revision %s to %s', (decision, revisionId, type) => {
    const entry = createNotification({
      eventId: id,
      eventType: 'course.review.decided',
      version: 1,
      occurredAt: '2026-11-24T00:00:00.000Z',
      producer: 'course-service',
      correlationId: id,
      payload: {
        recipientId: id,
        courseId: id,
        revisionId,
        decision,
        reason: decision === 'REJECT' ? 'Needs changes' : null,
        version: 3,
      },
    });

    expect(entry).toMatchObject({
      id,
      eventKey: id,
      recipientId: id,
      revisionId,
      type,
    });
    expect(entry.title.length).toBeGreaterThan(0);
    if (decision === 'REJECT') expect(entry.message).toContain('Needs changes');
  });
});
