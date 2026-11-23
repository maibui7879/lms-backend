const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseContract,
  ContractValidationError,
  ENDPOINTS,
  COURSE_REVIEW_NOTIFICATION_ROUTING_KEY,
} = require('../dist');
const api = require('../openapi/notification.json');
const id = '11111111-1111-4111-8111-111111111111';
const notification = {
  id,
  courseId: id,
  revisionId: null,
  type: 'COURSE_APPROVED',
  title: 'Course approved',
  message: 'Your course was approved.',
  createdAt: '2026-11-24T00:00:00.000Z',
  readAt: null,
};

test('course review notification events validate envelope and payload', () => {
  assert.equal(
    COURSE_REVIEW_NOTIFICATION_ROUTING_KEY,
    'course.review.decided.v1',
  );
  const event = {
    eventId: id,
    eventType: 'course.review.decided',
    version: 1,
    occurredAt: notification.createdAt,
    producer: 'course-service',
    correlationId: id,
    payload: {
      recipientId: id,
      courseId: id,
      revisionId: null,
      decision: 'APPROVE',
      reason: null,
      version: 1,
    },
  };
  for (const decision of ['APPROVE', 'REJECT']) {
    for (const revisionId of [null, id]) {
      parseContract('CourseReviewNotificationEvent', {
        ...event,
        payload: { ...event.payload, decision, revisionId, reason: 'Reviewed' },
      });
    }
  }
  parseContract('CourseReviewNotificationEvent', event);
  for (const field of Object.keys(event)) {
    const value = { ...event };
    delete value[field];
    assert.throws(
      () => parseContract('CourseReviewNotificationEvent', value),
      ContractValidationError,
    );
  }
  for (const field of Object.keys(event.payload)) {
    const payload = { ...event.payload };
    delete payload[field];
    assert.throws(
      () =>
        parseContract('CourseReviewNotificationEvent', { ...event, payload }),
      ContractValidationError,
    );
  }
  for (const change of [
    { eventId: 'invalid' },
    { correlationId: 'invalid' },
    { occurredAt: 'invalid' },
    { eventType: 'course.reviewed' },
    { version: 2 },
    { producer: 'notification-service' },
    { extra: true },
    ...[
      { recipientId: 'invalid' },
      { courseId: 'invalid' },
      { revisionId: 'invalid' },
      { decision: 'UNKNOWN' },
      { reason: 123 },
      { version: 0 },
      { version: 1.5 },
      { extra: true },
    ].map((payload) => ({ payload: { ...event.payload, ...payload } })),
  ]) {
    assert.throws(
      () =>
        parseContract('CourseReviewNotificationEvent', { ...event, ...change }),
      ContractValidationError,
    );
  }
});

test('notification data supports all decisions and required nullable fields', () => {
  for (const type of [
    'COURSE_APPROVED',
    'COURSE_REJECTED',
    'REVISION_APPROVED',
    'REVISION_REJECTED',
  ]) {
    parseContract('CourseNotificationData', { ...notification, type });
    parseContract('CourseNotificationData', {
      ...notification,
      type,
      revisionId: id,
      readAt: notification.createdAt,
    });
  }
  for (const value of [
    { ...notification, type: 'UNKNOWN' },
    { ...notification, revisionId: undefined },
    { ...notification, readAt: undefined },
    { ...notification, id: 'invalid' },
    { ...notification, createdAt: 'invalid' },
  ])
    assert.throws(
      () => parseContract('CourseNotificationData', value),
      ContractValidationError,
    );
});

test('notification filters and unread count validate without coercion', () => {
  for (const unreadOnly of [true, false, undefined])
    parseContract('NotificationQuery', { page: 1, limit: 100, unreadOnly });
  for (const value of [
    { unreadOnly: 'true' },
    { page: 0 },
    { limit: 101 },
    { userId: id },
  ]) {
    assert.throws(
      () => parseContract('NotificationQuery', value),
      ContractValidationError,
    );
  }
  parseContract('UnreadNotificationCount', { count: 0 });
  for (const count of [-1, 1.5, '1'])
    assert.throws(
      () => parseContract('UnreadNotificationCount', { count }),
      ContractValidationError,
    );
});

test('notification routes belong to Notification and mark-read requires no idempotency header', () => {
  const routes = ENDPOINTS.filter((e) =>
    e.path.startsWith('/api/v1/notifications'),
  );
  assert.equal(routes.length, 3);
  for (const route of routes) {
    assert.equal(route.service, 'notification');
    assert.equal(route.access, 'AUTHENTICATED');
    assert.equal(route.success, 200);
    const operation = api.paths[route.path][route.method];
    assert.deepEqual(operation.tags, ['notification']);
    assert.equal(
      require('../openapi/course.json').paths[route.path],
      undefined,
    );
    assert.deepEqual(operation.security, [{ bearerAuth: [] }]);
    assert.ok(!operation.parameters.some((p) => p.name === 'Idempotency-Key'));
  }
  assert.equal(
    routes.find((e) => e.method === 'get' && e.list).query,
    'NotificationQuery',
  );
  const read = api.paths['/api/v1/notifications/{id}/read'].put;
  assert.equal(read.requestBody, undefined);
  assert.equal(
    read.responses[200].content['application/json'].schema.properties.data.$ref,
    '#/components/schemas/CourseNotificationData',
  );
});
