const { test } = require('node:test');
const assert = require('node:assert/strict');
const Ajv = require('ajv');
const {
  parseContract,
  ContractValidationError,
  ENDPOINTS,
} = require('../dist');
const schemas = require('../src/schemas.json');
const api = require('../openapi.json');
const id = '11111111-1111-4111-8111-111111111111';
const id2 = '22222222-2222-4222-8222-222222222222';
const time = '2026-11-06T00:00:00.000Z';
const invalid = (name, value) =>
  assert.throws(() => parseContract(name, value), ContractValidationError);
const policy = {
  quizType: 'GRADED',
  durationSeconds: 600,
  passingScorePercent: 70,
  maxAttempts: 3,
  requiredForCompletion: true,
  shuffleQuestions: true,
  shuffleChoices: true,
  reviewPolicy: 'AFTER_SUBMISSION',
};
const question = {
  id,
  type: 'SINGLE_CHOICE',
  prompt: 'Choose one',
  choices: [
    { id, text: 'A' },
    { id: id2, text: 'B' },
  ],
  points: 1,
};

test('all schemas compile; every OpenAPI reference resolves', () => {
  const ajv = new Ajv({ strict: false, validateFormats: false });
  ajv.addSchema(schemas, 'lms');
  for (const name of Object.keys(schemas.definitions))
    ajv.compile({ $ref: `lms#/definitions/${name}` });
  function walk(value) {
    if (!value || typeof value !== 'object') return;
    if (value.$ref)
      assert.ok(
        api.components.schemas[value.$ref.split('/').pop()],
        value.$ref,
      );
    for (const child of Object.values(value)) walk(child);
  }
  walk(api);
  assert.equal(
    Object.values(api.paths).reduce(
      (sum, methods) => sum + Object.keys(methods).length,
      0,
    ),
    ENDPOINTS.length,
  );
  for (const service of ['identity', 'course', 'quiz', 'learning']) {
    const spec = require(`../openapi/${service}.json`);
    assert.equal(
      Object.values(spec.paths).reduce(
        (sum, methods) => sum + Object.keys(methods).length,
        0,
      ),
      ENDPOINTS.filter((e) => e.service === service).length,
    );
  }
});
test('signup prevents privilege escalation and rejects unknown properties', () => {
  const request = {
    email: 'student@example.test',
    password: 'synthetic-password',
  };
  assert.deepEqual(parseContract('RegisterRequest', request), request);
  for (const role of ['ADMIN', 'INSTRUCTOR', 'UNKNOWN'])
    invalid('RegisterRequest', { ...request, role });
  invalid('RegisterRequest', { ...request, userId: id });
  invalid('RegisterRequest', { ...request, password: 'short' });
  invalid('RegisterRequest', { ...request, email: 'bad' });
  invalid('CreateEnrollmentRequest', { userId: id });
});
test('student delivery rejects answer keys and explanations; authoring validates choices', () => {
  assert.deepEqual(parseContract('QuestionDeliveryDTO', question), question);
  invalid('QuestionDeliveryDTO', { ...question, correctChoiceIds: [id] });
  invalid('QuestionDeliveryDTO', { ...question, explanation: 'Answer is A' });
  const authoring = {
    ...question,
    skillIds: [],
    correctChoiceIds: [id],
    explanation: null,
    version: 1,
  };
  parseContract('QuestionAuthoringDTO', authoring);
  invalid('QuestionAuthoringDTO', {
    ...authoring,
    correctChoiceIds: [id, id2],
  });
  invalid('QuestionAuthoringDTO', {
    ...authoring,
    choices: [question.choices[0], question.choices[0]],
  });
  invalid('QuestionAuthoringDTO', {
    ...authoring,
    correctChoiceIds: ['33333333-3333-4333-8333-333333333333'],
  });
  invalid('QuestionAuthoringDTO', { ...authoring, points: 0 });
});
test('policy rejects invalid thresholds, durations, attempts and practice requirements', () => {
  parseContract('QuizPolicy', policy);
  for (const bad of [
    { passingScorePercent: 101 },
    { durationSeconds: 0 },
    { maxAttempts: 1.5 },
    { maxAttempts: 0 },
    { quizType: 'PRACTICE' },
  ])
    invalid('QuizPolicy', { ...policy, ...bad });
  invalid('CreateQuizRequest', {
    courseId: id,
    lessonId: id2,
    title: 'Quiz',
    policy,
    opensAt: time,
    closesAt: '2026-02-30T00:00:00Z',
  });
  invalid('CreateQuizRequest', {
    courseId: id,
    lessonId: id2,
    title: 'Quiz',
    policy,
    opensAt: time,
    closesAt: time,
  });
});
test('answers, concurrency and course rejection have strict request shapes', () => {
  parseContract('SaveAnswersRequest', {
    answers: [{ questionId: id, selectedChoiceIds: [] }],
    expectedRevision: 0,
  });
  invalid('SaveAnswersRequest', {
    answers: [{ questionId: id, selectedChoiceIds: [id, id] }],
    expectedRevision: 1,
  });
  invalid('SaveAnswersRequest', {
    answers: [
      { questionId: id, selectedChoiceIds: [] },
      { questionId: id, selectedChoiceIds: [] },
    ],
    expectedRevision: 1,
  });
  invalid('SubmitAttemptRequest', { expectedRevision: 1, score: 100 });
  invalid('ReviewCourseRequest', { expectedVersion: 1, decision: 'REJECT' });
  invalid('ReviewCourseRequest', {
    expectedVersion: 1,
    decision: 'REJECT',
    reason: '   ',
  });
  invalid('ReviewCourseRequest', {
    expectedVersion: 1,
    decision: 'APPROVE',
    reviewedBy: id,
  });
  parseContract('ReviewCourseRequest', {
    expectedVersion: 1,
    decision: 'REJECT',
    reason: 'Missing required lessons',
  });
  invalid('PageQuery', { page: 0, limit: 101 });
});
test('pending results use null scores; sync cannot invent successful receipts', () => {
  const result = {
    attemptId: id,
    quizId: id,
    courseId: id,
    userId: id,
    assessmentVersion: 1,
    attemptStatus: 'SUBMITTED',
    gradingStatus: 'PENDING_REVIEW',
    score: null,
    maxScore: null,
    passed: null,
    gradedAt: null,
  };
  parseContract('QuizResultV2Data', result);
  invalid('QuizResultV2Data', { ...result, score: 0 });
  invalid('QuizResultV2Data', { ...result, gradingStatus: 'GRADED' });
  parseContract('QuizResultV2Data', {
    ...result,
    gradingStatus: 'GRADED',
    score: 7,
    maxScore: 10,
    passed: true,
    gradedAt: time,
  });
  invalid('QuizResultV2Data', {
    ...result,
    gradingStatus: 'GRADED',
    score: 11,
    maxScore: 10,
    passed: true,
    gradedAt: time,
  });
  const sync = {
    attemptId: id,
    eventId: null,
    status: 'PENDING',
    updatedAt: null,
    error: null,
  };
  parseContract('ProgressSyncData', sync);
  invalid('ProgressSyncData', { ...sync, status: 'SYNCED' });
  invalid('ProgressSyncData', { ...sync, status: 'FAILED' });
});
test('v1 events remain readable; v2 requires versioned grading evidence', () => {
  const payload = {
    attemptId: id,
    quizId: id,
    courseId: id,
    userId: id,
    score: 7,
    maxScore: 10,
    passed: true,
  };
  const event = {
    eventId: id,
    eventType: 'quiz.attempt.graded',
    version: 1,
    occurredAt: time,
    producer: 'quiz-service',
    correlationId: 'test-request',
    payload,
  };
  parseContract('AttemptGradedEvent', event);
  invalid('AttemptGradedV2Event', { ...event, version: 2 });
  const v2 = {
    ...event,
    version: 2,
    payload: {
      ...payload,
      assessmentVersion: 1,
      quizType: 'GRADED',
      passingScorePercent: 70,
      gradedAt: time,
      skillScores: [],
    },
  };
  parseContract('AttemptGradedV2Event', v2);
  const skillScore = { skillId: id, score: 7, maxScore: 10 };
  const withSkill = (entry) => ({
    ...v2,
    payload: { ...v2.payload, skillScores: [entry] },
  });
  parseContract('AttemptGradedV2Event', withSkill(skillScore));
  parseContract('AttemptGradedV2Event', withSkill({ ...skillScore, questionCount: 3 }));
  for (const questionCount of [0, -1, 1.5, '3', null]) {
    invalid('AttemptGradedV2Event', withSkill({ ...skillScore, questionCount }));
  }
  invalid('AttemptGradedV2Event', {
    ...v2,
    payload: { ...v2.payload, passed: false },
  });
  invalid('AttemptGradedV2Event', { ...v2, producer: 'course-service' });
});

test('new enrollments require pinned snapshots and the correct event producer', () => {
  const payload = {
    enrollmentId: id,
    courseId: id,
    userId: id2,
    status: 'ACTIVE',
    enrolledAt: time,
  };
  const envelope = {
    eventId: id,
    eventType: 'course.enrollment.created',
    version: 1,
    occurredAt: time,
    producer: 'course-service',
    correlationId: 'request-test',
    payload,
  };
  parseContract('EnrollmentCreatedEvent', envelope);
  invalid('EnrollmentSnapshotData', payload);
  invalid('EnrollmentCreatedV2Event', { ...envelope, version: 2 });
  const v2 = {
    ...envelope,
    version: 2,
    payload: { ...payload, contentVersion: 1 },
  };
  parseContract('EnrollmentCreatedV2Event', v2);
  invalid('EnrollmentCreatedV2Event', { ...v2, producer: 'quiz-service' });
  invalid('CourseCompletionPolicy', {
    courseId: id,
    contentVersion: 1,
    requiredItemIds: [],
    requiredAssessments: [],
    chapterPolicies: [],
    sequence: 'FREE',
    assessmentRule: 'ANY_PASSED_ATTEMPT_SAME_VERSION',
    certificateEnabled: true,
  });
  parseContract('CourseCompletionPolicy', {
    courseId: id,
    contentVersion: 1,
    requiredItemIds: [id],
    requiredAssessments: [],
    chapterPolicies: [
      { chapterId: id2, requiredItemIds: [id], requiredAssessments: [] },
    ],
    sequence: 'SEQUENTIAL',
    assessmentRule: 'ANY_PASSED_ATTEMPT_SAME_VERSION',
    certificateEnabled: true,
  });
});
