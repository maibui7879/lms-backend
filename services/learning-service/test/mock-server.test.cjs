const assert = require('node:assert/strict');
const { once } = require('node:events');
const { test } = require('node:test');
const { parseContract } = require('@lms/contracts');
const { createLearningMockServer } = require('./mock-server.cjs');
const { course, quiz } = require('./fixtures/learning-providers.mock.json');
const skillFixtures = require('./fixtures/course-skills.mock.json');
const masteryFixture = require('./fixtures/mastery.mock.json');
const recommendationFixture = require('./fixtures/recommendations.mock.json');
const { revocationReason } = require('./fixtures/certificates.mock.json');
const {
  requests,
  expected,
} = require('./fixtures/learning-scenarios.mock.json');

const base = '/api/v1/learning';
const coursePath = `${base}/courses/${course.enrollment.courseId}`;
const [chapter1, chapter2] = course.structure.outline.chapters;
const firstLesson = chapter1.lessons[0];
const videoPath = `${base}/items/${expected.videoCompleted.learningItemId}/completion`;
const readingPath = `${base}/items/${chapter2.lessons[0].items[0].id}/completion`;
const lessonPath = `${base}/lessons/${firstLesson.id}`;

async function start(t, options) {
  const server = createLearningMockServer(options);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));

  return async function call(
    path,
    {
      method = 'GET',
      body,
      user = 'studentB',
      status = 200,
      schema,
      serviceToken,
      idempotencyKey,
    } = {},
  ) {
    const headers = { 'X-Request-Id': 'learning-mock-test' };
    if (user) headers['X-Mock-User'] = user;
    if (serviceToken) headers.Authorization = `Bearer ${serviceToken}`;
    if (idempotencyKey !== undefined)
      headers['Idempotency-Key'] = idempotencyKey;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}${path}`,
      {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      },
    );
    if (response.status === 204) {
      assert.equal(status, 204);
      return null;
    }
    const payload = await response.json();
    assert.equal(response.status, status, JSON.stringify(payload));
    assert.equal(response.headers.get('x-request-id'), 'learning-mock-test');
    if (status >= 400) {
      assert.equal(payload.requestId, 'learning-mock-test');
      return parseContract('ApiErrorResponse', payload).error;
    }
    assert.equal(payload.meta.requestId, 'learning-mock-test');
    return schema ? parseContract(schema, payload.data) : payload.data;
  };
}

test('MST-01 lets owners update the catalog and students see active skills', async (t) => {
  const call = await start(t);
  const path = `${coursePath}/skills`;
  assert.deepEqual((await call(path)).skills, [skillFixtures.skills[0]]);
  assert.deepEqual(
    (await call(path, { user: 'instructorA' })).skills,
    skillFixtures.skills,
  );
  const skill = await call(path, {
    method: 'POST',
    user: 'instructorA',
    status: 201,
    schema: 'CourseSkillData',
    body: { name: '  Dependency injection  ', description: '' },
  });
  assert.equal(skill.name, 'Dependency injection');
  const retired = await call(`${path}/${skill.id}`, {
    method: 'PATCH',
    user: 'instructorA',
    body: { status: 'INACTIVE', expectedVersion: 1 },
  });
  assert.equal(retired.version, 2);
  assert.equal(retired.status, 'INACTIVE');
  assert.equal(
    (
      await call(`${path}/${skill.id}`, {
        method: 'PATCH',
        user: 'instructorA',
        body: { name: 'Stale', expectedVersion: 1 },
        status: 409,
      })
    ).code,
    'VERSION_CONFLICT',
  );
  assert.deepEqual((await call(path)).skills, [skillFixtures.skills[0]]);
  const internal = `/api/v1/internal/courses/${course.enrollment.courseId}/skills/${skill.id}`;
  await call(internal, { user: 'adminA', status: 401 });
  assert.deepEqual(
    await call(internal, {
      user: '',
      serviceToken:
        process.env.LEARNING_SKILL_LOOKUP_TOKEN ?? 'learning-mock-skill-token',
    }),
    retired,
  );
});

test('MST-01 scopes mock catalogs to the owner and the enrolled course', async (t) => {
  const call = await start(t);
  const path = `${coursePath}/skills`;
  const draft = `${base}/courses/${skillFixtures.secondCourse.id}/skills`;
  await call(path, { status: 403, user: 'studentA' });
  await call(path, { user: 'instructorB', status: 403 });
  await call(draft, { status: 403 });
  const foreignSkill = await call(draft, {
    method: 'POST',
    user: 'instructorB',
    status: 201,
    body: { name: 'Dependency injection', description: 'Draft' },
  });
  assert.equal(foreignSkill.courseId, skillFixtures.secondCourse.id);
  await call(`${path}/${foreignSkill.id}`, {
    method: 'PATCH',
    user: 'instructorA',
    status: 404,
    body: { status: 'INACTIVE', expectedVersion: 1 },
  });
});

test('MST-02 validates skill IDs and returns the rejected IDs in mock HTTP', async (t) => {
  const call = await start(t);
  const [active, inactive] = skillFixtures.skills;
  const route = `/api/v1/internal/courses/${active.courseId}/skills/validate`;
  const auth = {
    method: 'POST',
    user: '',
    serviceToken:
      process.env.LEARNING_SKILL_LOOKUP_TOKEN ?? 'learning-mock-skill-token',
  };
  await call(route, {
    ...auth,
    body: { skillIds: [active.id.toUpperCase()] },
    status: 204,
  });
  const invalid = await call(route, {
    ...auth,
    body: { skillIds: [active.id, inactive.id] },
    status: 422,
  });
  assert.equal(invalid.code, 'INVALID_SKILL_REFERENCE');
  assert.deepEqual(invalid.details, { skillIds: [inactive.id] });
  await call(route, {
    ...auth,
    body: { skillIds: [active.id, active.id.toUpperCase()] },
    status: 400,
  });
  await call(route, {
    method: 'POST',
    body: { skillIds: [active.id] },
    status: 401,
  });
});

test('MST-03/05/06/07 shows weighted mastery and paginated history from graded results', async (t) => {
  const call = await start(t);
  const path = `${coursePath}/mastery`;
  const read = () => call(path, { schema: 'MasteryData' });
  const event = (event) =>
    call('/__mock/events', { method: 'POST', body: { event } });
  assert.deepEqual((await read()).skills, []);
  await call(path, { user: 'studentA', status: 403 });
  await call(`${path}/history`, { user: 'studentA', status: 403 });
  const sample = masteryFixture.attempts[1];
  const grade = await call(
    `/api/v1/internal/attempts/${sample.attemptId}/graded`,
    {
      user: '',
      serviceToken: process.env.QUIZ_SERVICE_TOKEN ?? 'quiz-mock-service-token',
      schema: 'GradedAssessmentSummary',
    },
  );
  assert.equal(grade.skillScores[0].questionCount, 5);
  await call(`/api/v1/internal/attempts/${sample.attemptId}/graded`, {
    status: 401,
  });
  assert.deepEqual((await read()).skills, []);
  await event('masteryAttemptSecond');
  const recorded = (await call(`${path}/history`)).items[0];
  assert.equal(recorded.skills[0].questionCount, 5);
  const beforeLateResult = await read();
  await event('masteryAttemptFirst');
  const data = await read();
  assert.ok(Date.parse(data.updatedAt) > Date.parse(beforeLateResult.updatedAt));
  await event('masteryAttemptSecond');
  assert.deepEqual(await read(), data);
  assert.equal(data.algorithmVersion, masteryFixture.algorithmVersion);
  assert.equal(data.skills[0].evidenceCount, 2);
  assert.equal(data.skills[0].questionCount, 8);
  assert.equal(data.skills[0].level, 'PROFICIENT');
  assert.ok(Math.abs(data.skills[0].scorePercent - 73.33333333) < 1e-8);
  const page = await call(`${path}/history?page=2&limit=1`);
  assert.equal(page.total, 2);
  assert.equal(page.items[0].attemptId, masteryFixture.attempts[0].attemptId);
  assert.equal(page.items[0].skills[0].scorePercent, 40);
  assert.equal(page.items[0].skills[0].level, 'DEVELOPING');
  assert.equal(page.items[0].skills[0].questionCount, 3);
  assert.deepEqual((await call(`${path}/history`)).items[0], recorded);
});

test('ADP-01 suggests an accessible lesson only after there is enough mastery evidence', async (t) => {
  const call = await start(t);
  const path = `${base}/me/recommendations`;
  const event = (event) =>
    call('/__mock/events', { method: 'POST', body: { event } });
  const empty = { items: [], page: 1, limit: 20, total: 0 };
  assert.deepEqual(await call(path), empty);
  await call(path, { user: '', status: 401 });
  await call(path, { user: 'instructorA', status: 403 });
  await call(`${path}?userId=${course.enrollment.userId}`, { status: 400 });
  await call(`${path}?page=1&page=2`, { status: 400 });

  await event('recommendationFewQuestions');
  assert.deepEqual(await call(path), empty);
  await event('recommendationMoreQuestions');
  const suggestion = {
    courseId: course.enrollment.courseId,
    lessonId: firstLesson.id,
    learningItemId: null,
    reason: 'LOW_MASTERY',
    explanation:
      'Kỹ năng Tổ chức module đạt 35% từ 8 câu đã chấm. Ôn bài Giới thiệu module.',
  };
  assert.deepEqual(await call(path), {
    ...empty,
    items: [suggestion],
    total: 1,
  });
  await event('recommendationMoreQuestions');
  assert.deepEqual(await call(`${path}?page=1&limit=1`), {
    items: [suggestion],
    page: 1,
    limit: 1,
    total: 1,
  });
  assert.deepEqual(await call(`${path}?page=2&limit=1`), {
    items: [],
    page: 2,
    limit: 1,
    total: 1,
  });
  assert.deepEqual(await call(path, { user: 'studentA' }), empty);

  await call(videoPath, { method: 'PUT', body: requests.completeItem });
  const [practice, , , nextPractice] = recommendationFixture.quizzes;
  const afterVideo = await call(path);
  assert.equal(afterVideo.total, 2);
  assert.deepEqual(afterVideo.items[1], {
    ...suggestion,
    learningItemId: practice.itemId,
    explanation:
      'Kỹ năng Tổ chức module đạt 35% từ 8 câu đã chấm. Làm “Quiz ôn tập module”. Còn 2 lượt.',
  });
  await event('chapterAttempt80');
  assert.equal((await call(path)).total, 3);
  await call(readingPath, { method: 'PUT', body: requests.completeItem });
  const unlocked = await call(path);
  assert.equal(unlocked.total, 4);
  assert.deepEqual(unlocked.items.map(({ learningItemId }) => learningItemId), [
    null, practice.itemId, null, nextPractice.itemId,
  ]);
  await call(`${coursePath}/skills/${skillFixtures.skills[0].id}`, {
    user: 'instructorA',
    method: 'PATCH',
    body: { status: 'INACTIVE', expectedVersion: 1 },
  });
  assert.deepEqual(await call(path), empty);
});

test('ADP-06/07 mock validates the graph and recommends prerequisites before the dependent skill', async (t) => {
  const call = await start(t);
  const route = `${coursePath}/skill-prerequisites`;
  const actor = { user: 'instructorA' };
  const [skill, prerequisite] = skillFixtures.skills;
  const graph = {
    expectedVersion: 0,
    edges: [{ skillId: skill.id, prerequisiteSkillId: prerequisite.id }],
  };
  const save = (body, status = 200) => call(route, {
    ...actor, method: 'PUT', body, status,
  });
  assert.equal((await call(route, actor)).version, 0);
  await call(route, { status: 403 });
  await save(graph, 422);
  await call(`${coursePath}/skills/${prerequisite.id}`, {
    ...actor,
    method: 'PATCH',
    body: { status: 'ACTIVE', expectedVersion: prerequisite.version },
  });
  await save({
    expectedVersion: 0,
    edges: [...graph.edges, { skillId: prerequisite.id, prerequisiteSkillId: skill.id }],
  }, 400);
  for (const sample of recommendationFixture.attempts.filter(({ daysAgo }) => daysAgo)) {
    await call('/__mock/events', { method: 'POST', body: { event: sample.name } });
  }
  const recommendations = `${base}/me/recommendations`;
  assert.match((await call(recommendations)).items[0].explanation, /giảm 42 điểm phần trăm/);
  assert.equal((await save(graph)).version, 1);
  await save(graph, 409);
  const [beforeAdvanced] = (await call(recommendations)).items;
  assert.equal(beforeAdvanced.reason, 'SKILL_PREREQUISITE');
  assert.match(beforeAdvanced.explanation, /Củng cố kỹ năng Cấu hình ứng dụng cũ trước khi ôn Tổ chức module/);
  await save({ expectedVersion: 1, edges: [] });
  assert.equal((await call(recommendations)).items[0].reason, 'LOW_MASTERY');
});

test('ADP-03 Quiz mock reads versioned eligibility without creating attempts', async (t) => {
  const call = await start(t);
  const [practice, spent, denied] = recommendationFixture.quizzes;
  const { courseId, userId } = course.enrollment;
  const route = ({ quizId, assessmentVersion }) =>
    `/api/v1/internal/quizzes/${quizId}/recommendation-context?courseId=${courseId}&userId=${userId}&assessmentVersion=${assessmentVersion}`;
  const credentials = {
    user: '',
    serviceToken: process.env.QUIZ_SERVICE_TOKEN ?? 'quiz-mock-service-token',
    schema: 'QuizRecommendationContext',
  };
  await call(route(practice), { user: 'studentB', status: 401 });
  const context = await call(route(practice), credentials);
  assert.equal(context.canStart, true);
  assert.equal(context.attemptsRemaining, 2);
  assert.deepEqual(await call(route(practice), credentials), context);
  assert.equal((await call(route(spent), credentials)).attemptsRemaining, 0);
  assert.equal((await call(route(denied), credentials)).canStart, false);
  await call(route({ ...practice, assessmentVersion: 999 }), { ...credentials, status: 404 });
  await call(`${route(practice)}&assessmentVersion=2`, { ...credentials, status: 400 });
});

test('ADP-01 omits skills at the threshold and with unknown question counts', async (t) => {
  const call = await start(t);
  const path = `${base}/me/recommendations`;
  const event = (event) =>
    call('/__mock/events', { method: 'POST', body: { event } });
  await event('recommendationAtThreshold');
  assert.equal((await call(path)).total, 0);
  await event('recommendationLegacyResult');
  const [skill] = (await call(`${coursePath}/mastery`)).skills;
  assert.equal(skill.scorePercent, 37.5);
  assert.equal(skill.questionCount, null);
  assert.equal((await call(path)).total, 0);
});

test('PRG-04 shows synced quiz scores to the learner and course owner', async (t) => {
  const call = await start(t);
  const mine = `${coursePath}/me/quiz-scores`;
  const owner = `${coursePath}/quiz-scores`;
  const apply = (event) =>
    call('/__mock/events', { method: 'POST', body: { event } });
  const empty = { items: [], page: 1, limit: 20, total: 0 };
  assert.deepEqual(await call(mine), empty);
  assert.deepEqual(await call(owner, { user: 'instructorA' }), empty);
  assert.equal(
    (await call(mine, { user: 'studentA', status: 403 })).code,
    'ENROLLMENT_REQUIRED',
  );
  assert.equal(
    (await call(owner, { user: 'instructorB', status: 403 })).code,
    'NOT_COURSE_OWNER',
  );
  assert.equal((await call(owner, { status: 403 })).code, 'FORBIDDEN');
  await call(`${mine}?page=1&page=2`, { status: 400 });

  await apply('chapterAttempt79');
  const { userId, courseId, quizId, assessmentVersion } =
    quiz.chapterAttempt79.payload;
  const initial = {
    userId,
    courseId,
    quizId,
    assessmentVersion,
    gradedAttempts: 1,
    bestScorePercent: 79,
    passed: false,
  };
  assert.deepEqual((await call(mine)).items, [initial]);

  await apply('chapterAttempt80');
  await apply('chapterAttempt80');
  const summary = await call(`${mine}?limit=1`);
  assert.deepEqual(summary, {
    items: [
      { ...initial, gradedAttempts: 2, bestScorePercent: 80, passed: true },
    ],
    total: 1,
    page: 1,
    limit: 1,
  });
  assert.deepEqual(
    await call(`${owner}?limit=1`, { user: 'instructorA' }),
    summary,
  );
  assert.deepEqual(await call(`${owner}?limit=1`, { user: 'adminA' }), summary);
});

test('PRG-05 shows lesson progress, latest activity and a valid next step', async (t) => {
  const call = await start(t);
  const dashboard = (user = 'studentB') =>
    call(`${base}/me/dashboard`, { user, schema: 'LearningDashboardData' });
  assert.deepEqual((await dashboard('studentA')).courses, []);
  const initial = await dashboard();
  assert.deepEqual(initial.recentQuizzes, []);
  assert.equal(initial.courses[0].lessonProgressPercent, 0);
  const checkpoint = await call(`${coursePath}/resume`, {
    method: 'PUT',
    body: requests.saveResume,
  });
  const resumed = (await dashboard()).courses[0];
  assert.equal(resumed.lastActivityAt, checkpoint.updatedAt);
  assert.equal(resumed.nextStep.positionSeconds, 60);
  await call(videoPath, { method: 'PUT', body: requests.completeItem });
  assert.equal((await dashboard()).courses[0].nextStep.kind, 'COMPLETE_LESSON');
  await call(`${lessonPath}/completion`, {
    method: 'PUT',
    body: requests.completeItem,
  });
  await call('/__mock/events', {
    method: 'POST',
    body: { event: 'chapterAttempt79' },
  });
  const updated = await dashboard();
  assert.equal(updated.courses[0].lessonProgressPercent, 50);
  assert.equal(updated.courses[0].nextStep.kind, 'QUIZ');
  assert.equal(updated.recentQuizzes[0].scorePercent, 79);
  assert.equal(updated.recentQuizzes[0].passed, false);
});

test('PRG-01/02 waits for lesson confirmation even when all items and quizzes pass', async (t) => {
  const call = await start(t);
  const completion = { method: 'PUT', body: requests.completeItem };
  await call(videoPath, completion);
  await call('/__mock/events', {
    method: 'POST',
    body: { event: 'chapterAttempt80' },
  });
  await call(readingPath, completion);
  await call('/__mock/events', {
    method: 'POST',
    body: { event: 'attemptGraded' },
  });
  const progress = () => call(`${coursePath}/progress`);
  assert.equal((await progress()).lessonProgressPercent, 0);
  assert.equal((await progress()).status, 'IN_PROGRESS');
  assert.equal((await progress()).completedAt, null);
  await call(`${lessonPath}/completion`, completion);
  assert.equal((await progress()).lessonProgressPercent, 50);
  const last = await call(
    `${base}/lessons/${chapter2.lessons[0].id}/completion`,
    completion,
  );
  assert.equal((await progress()).status, 'COMPLETED');
  assert.equal((await progress()).completedAt, last.completedAt);
});

test('PRG-01 to PRG-08 completes the full Postman workflow with mock providers', async (t) => {
  const call = await start(t);
  const dashboardPath = `${base}/me/dashboard`;
  const apply = (event) =>
    call('/__mock/events', { method: 'POST', body: { event } });
  const completion = { method: 'PUT', body: requests.completeItem };
  const progress = () =>
    call(`${coursePath}/progress`, { schema: 'CourseProgressData' });
  assert.equal((await progress()).status, 'NOT_STARTED');
  assert.equal(await call(`${coursePath}/resume`), null);
  const saved = await call(`${coursePath}/resume`, {
    method: 'PUT',
    body: requests.saveResume,
  });
  assert.equal(
    (await call(dashboardPath)).courses[0].nextStep.positionSeconds,
    saved.positionSeconds,
  );
  assert.equal((await progress()).lessonProgressPercent, 0);

  await call(videoPath, completion);
  await call(`${lessonPath}/completion`, completion);
  await apply('chapterAttempt79');
  const chapterScores = await call(`${coursePath}/me/quiz-scores`);
  assert.equal(chapterScores.items[0].passed, false);
  assert.equal((await progress()).lessonProgressPercent, 50);
  assert.equal(
    (await call(`${coursePath}/chapters/access`)).chapters[1].status,
    'LOCKED',
  );
  assert.deepEqual(
    await call(`${coursePath}/quiz-scores`, { user: 'instructorA' }),
    chapterScores,
  );

  await apply('chapterAttempt80');
  assert.equal(
    (await call(`${coursePath}/chapters/access`)).chapters[1].status,
    'UNLOCKED',
  );
  await call(readingPath, completion);
  await call(
    `${base}/lessons/${chapter2.lessons[0].id}/completion`,
    completion,
  );
  const awaitingQuiz = await progress();
  assert.equal(awaitingQuiz.lessonProgressPercent, 100);
  assert.equal(awaitingQuiz.status, 'IN_PROGRESS');

  await apply('attemptGraded');
  const done = await progress();
  assert.equal(done.status, 'COMPLETED');
  assert.equal(done.passedRequiredAssessments, 1);
  const sync = await call(
    `${base}/attempts/${quiz.attemptGraded.payload.attemptId}/sync`,
  );
  assert.equal(sync.status, 'SYNCED');
  const dashboard = await call(dashboardPath, {
    schema: 'LearningDashboardData',
  });
  assert.equal(dashboard.courses[0].nextStep, null);
  assert.equal(dashboard.recentQuizzes.length, 3);

  await apply('attemptGraded');
  assert.deepEqual(await progress(), done);
  assert.deepEqual(await call(dashboardPath), dashboard);
});

function applyCertificateFixture(call, event, status = 200) {
  return call('/__mock/events', { method: 'POST', body: { event }, status });
}

async function completeCertificateLessons(call) {
  const completion = { method: 'PUT', body: requests.completeItem };
  await call(videoPath, completion);
  await call(`${lessonPath}/completion`, completion);
  await applyCertificateFixture(call, 'chapterAttempt80');
  await call(readingPath, completion);
  await call(`${base}/lessons/${chapter2.lessons[0].id}/completion`, completion);
}

test('CERT-01/04/06 gates issuance and deduplicates concurrent requests and expired keys', async (t) => {
  let now = Date.parse('2026-11-15T08:00:00Z');
  const call = await start(t, { now: () => now });
  const path = `${coursePath}/certificate`;
  const list = `${base}/me/certificates`;
  const issue = (key, options) => call(path, {
    method: 'POST',
    idempotencyKey: key,
    status: 201,
    schema: 'CertificateData',
    ...options,
  });

  await issue(undefined, { status: 400 });
  await issue('x'.repeat(129), { status: 400 });
  await issue('issue-1', { user: null, status: 401 });
  await issue('issue-1', { user: 'studentA', status: 403 });
  await issue('issue-1', { body: { contentVersion: 2 }, status: 400 });
  assert.equal((await issue('early', { status: 409 })).code, 'CERTIFICATE_NOT_ELIGIBLE');
  await completeCertificateLessons(call);
  assert.equal((await call(`${coursePath}/progress`)).lessonProgressPercent, 100);
  assert.equal((await issue('early', { status: 409 })).code, 'CERTIFICATE_NOT_ELIGIBLE');
  assert.equal((await call(list)).total, 0);

  await applyCertificateFixture(call, 'attemptGraded');
  const [first, sameKey, otherKey] = await Promise.all([
    issue('issue-1'), issue('issue-1'), issue('issue-2'),
  ]);
  assert.deepEqual(sameKey, first);
  assert.deepEqual(otherKey, first);
  assert.equal(first.contentVersion, course.enrollment.contentVersion);
  assert.match(first.verificationCode, /^[A-Za-z0-9_-]{32}$/);
  now += 25 * 60 * 60 * 1000;
  assert.deepEqual(await issue('issue-1'), first);
  assert.deepEqual((await call(list)).items, [first]);
  assert.equal((await call(list, { user: 'studentA' })).total, 0);
});

test('CERT-06 keeps the old certificate valid until a voluntary retake earns the replacement', async (t) => {
  const call = await start(t);
  const issue = (key, status = 201) => call(`${coursePath}/certificate`, {
    method: 'POST', idempotencyKey: key, status, schema: 'CertificateData',
  });
  const apply = (event, status) => applyCertificateFixture(call, event, status);
  const verify = (code) => call(`/api/v1/certificates/verify/${code}`, {
    user: null, schema: 'CertificateVerificationData',
  });
  await completeCertificateLessons(call);
  await apply('attemptGraded');
  const first = await issue('v1');
  assert.equal((await verify(first.verificationCode)).valid, true);
  assert.deepEqual(await verify('unknown-code'), {
    valid: false, status: null, courseTitle: null, recipientName: null, issuedAt: null,
  });
  await apply('certificateStartRetake', 409);
  await apply('certificatePublishVersion2');
  assert.deepEqual(await issue('v1-new-key'), first);
  await apply('certificateCompleteRetake', 409);
  await apply('certificateStartRetake');
  assert.equal((await issue('v2-early', 409)).code, 'CERTIFICATE_NOT_ELIGIBLE');
  assert.equal((await verify(first.verificationCode)).valid, true);

  await apply('certificateCompleteRetake');
  const [second, repeated] = await Promise.all([issue('v2'), issue('v2-other')]);
  assert.deepEqual(repeated, second);
  assert.equal(second.contentVersion, 2);
  assert.notEqual(second.id, first.id);
  assert.notEqual(second.verificationCode, first.verificationCode);
  const historical = { ...first, status: 'SUPERSEDED', supersededByCertificateId: second.id };
  assert.deepEqual(await issue('v1'), historical);
  assert.deepEqual(await verify(first.verificationCode), {
    valid: true, status: 'SUPERSEDED', courseTitle: course.publishedCourse.title,
    recipientName: null, issuedAt: first.issuedAt,
  });
  assert.equal((await verify(second.verificationCode)).valid, true);
  assert.deepEqual(await issue('v2-third-key'), second);
  const list = `${base}/me/certificates`;
  assert.deepEqual((await call(list)).items, [second, historical]);
  assert.deepEqual(await call(`${list}?page=2&limit=1`), {
    items: [historical], page: 2, limit: 1, total: 2,
  });
});

test('CERT-01 rejects an otherwise complete course when certification is disabled', async (t) => {
  const call = await start(t);
  await completeCertificateLessons(call);
  await applyCertificateFixture(call, 'attemptGraded');
  await applyCertificateFixture(call, 'certificateDisableIssuance');
  assert.equal((await call(`${coursePath}/progress`)).status, 'COMPLETED');
  const error = await call(`${coursePath}/certificate`, {
    method: 'POST', idempotencyKey: 'disabled', status: 409,
  });
  assert.equal(error.code, 'CERTIFICATE_NOT_ELIGIBLE');
});

test('CERT-07 Admin revokes once and public verification distinguishes revoked from unknown', async (t) => {
  const call = await start(t);
  await completeCertificateLessons(call);
  await applyCertificateFixture(call, 'attemptGraded');
  const issue = (key, status) => call(`${coursePath}/certificate`, {
    method: 'POST', idempotencyKey: key, status,
  });
  const first = await issue('before-revoke', 201);
  const revoke = (user, status, reason = revocationReason) => call(`/api/v1/admin/certificates/${first.id}/revocation`, {
    method: 'PUT', user, status, body: { reason }, schema: 'CertificateRevocationData',
  });
  await revoke(null, 401);
  assert.equal((await revoke('studentB', 403)).code, 'FORBIDDEN');
  assert.equal((await revoke('instructorA', 403)).code, 'FORBIDDEN');
  assert.equal((await revoke('adminA', 400, '   ')).code, 'VALIDATION_ERROR');
  const audit = await revoke('adminA', 200);
  assert.equal(audit.reason, revocationReason);
  assert.deepEqual(await revoke('adminA', 200, 'Lý do mới'), audit);
  const verify = (code) => call(`/api/v1/certificates/verify/${code}`, {
    user: null, schema: 'CertificateVerificationData',
  });
  assert.deepEqual(await verify(first.verificationCode), {
    valid: false, status: 'REVOKED', courseTitle: null, recipientName: null, issuedAt: null,
  });
  assert.equal((await verify('unknown')).status, null);
  assert.equal((await issue('before-revoke', 409)).code, 'CERTIFICATE_REVOKED');
  assert.equal((await issue('after-revoke', 409)).code, 'CERTIFICATE_REVOKED');
});

test('critical migration invalidates a selected item and is idempotent after relearning', async (t) => {
  const call = await start(t);
  const migration = {
    revisionId: '00000000-0000-4000-8000-000000000901',
    itemIds: ['00000000-0000-4000-8000-000000000902'],
    reason: 'Video đã được chỉnh sửa',
    policy: 'REQUIRE_RECOMPLETION',
  };
  const internalPath = `/api/v1/internal/courses/${course.enrollment.courseId}/migrations`;
  const apply = (policy = migration.policy) =>
    call(internalPath, {
      method: 'POST',
      body: { ...migration, policy },
      status: 204,
      serviceToken:
        process.env.LEARNING_SERVICE_TOKEN ?? 'learning-mock-service-token',
    });
  await call(internalPath, { method: 'POST', body: migration, status: 401 });
  const saved = await call(`${coursePath}/resume`, {
    method: 'PUT',
    body: requests.saveResume,
  });
  await call(videoPath, { method: 'PUT', body: requests.completeItem });
  await call(`${lessonPath}/completion`, {
    method: 'PUT',
    body: requests.completeItem,
  });
  await apply('NOTIFY_ONLY');
  await apply();
  const state = await call(`${lessonPath}/progress`, {
    schema: 'LessonProgressData',
  });
  assert.equal(state.status, 'OUTDATED');
  assert.equal(state.items[0].status, 'OUTDATED');
  assert.equal(state.items[0].invalidationReason, migration.reason);
  assert.deepEqual(await call(`${coursePath}/resume`), {
    ...saved,
    positionSeconds: 0,
  });
  const moved = await call(`${coursePath}/resume`, {
    method: 'PUT',
    body: {
      ...requests.saveResume,
      positionSeconds: 15,
      expectedRevision: saved.revision,
    },
  });
  assert.equal(moved.revision, saved.revision + 1);
  assert.equal((await call(`${coursePath}/progress`)).lessonProgressPercent, 0);
  await call(videoPath, { method: 'PUT', body: requests.completeItem });
  await call(`${lessonPath}/completion`, {
    method: 'PUT',
    body: requests.completeItem,
  });
  await apply();
  assert.equal(
    (await call(`${coursePath}/progress`)).lessonProgressPercent,
    50,
  );
  assert.equal(
    (await call(`${lessonPath}/progress`)).items[0].invalidatedAt,
    null,
  );
  assert.equal(
    (await call(`${lessonPath}/progress`)).items[0].invalidationReason,
    null,
  );
});

test('keeps an unaffected checkpoint while its chapter is temporarily locked by migration', async (t) => {
  const call = await start(t);
  await call(videoPath, { method: 'PUT', body: requests.completeItem });
  await call(`${lessonPath}/completion`, {
    method: 'PUT',
    body: requests.completeItem,
  });
  await call('/__mock/events', {
    method: 'POST',
    body: { event: 'chapterAttempt80' },
  });
  const checkpoint = await call(`${coursePath}/resume`, {
    method: 'PUT',
    body: requests.resumeChapter2,
  });
  await call(
    `/api/v1/internal/courses/${course.enrollment.courseId}/migrations`,
    {
      method: 'POST',
      serviceToken:
        process.env.LEARNING_SERVICE_TOKEN ?? 'learning-mock-service-token',
      status: 204,
      body: {
        revisionId: '00000000-0000-4000-8000-000000000901',
        itemIds: ['00000000-0000-4000-8000-000000000902'],
        reason: 'Học lại video ở chương trước',
        policy: 'REQUIRE_RECOMPLETION',
      },
    },
  );
  await call(`${coursePath}/resume`, { status: 403 });
  const dashboard = await call(`${base}/me/dashboard`);
  assert.equal(
    dashboard.courses[0].nextStep.learningItemId,
    expected.videoCompleted.learningItemId,
  );
  await call(videoPath, { method: 'PUT', body: requests.completeItem });
  await call(`${lessonPath}/completion`, {
    method: 'PUT',
    body: requests.completeItem,
  });
  assert.deepEqual(await call(`${coursePath}/resume`), checkpoint);
});

test('reads progress and rejects unauthorized or invalid input', async (t) => {
  const call = await start(t);
  assert.deepEqual(
    await call(`${coursePath}/progress`, { schema: 'CourseProgressData' }),
    expected.initial,
  );
  assert.equal(
    (await call(`${coursePath}/progress`, { status: 401, user: null })).code,
    'UNAUTHORIZED',
  );
  assert.equal(
    (await call(`${coursePath}/progress`, { status: 403, user: 'studentA' }))
      .code,
    'ENROLLMENT_REQUIRED',
  );
  assert.equal(
    (
      await call(videoPath, {
        method: 'PUT',
        body: { completed: false },
        status: 400,
      })
    ).code,
    'VALIDATION_ERROR',
  );
  assert.equal(
    (
      await call(videoPath, {
        method: 'PUT',
        body: requests.wrongContentVersion,
        status: 409,
      })
    ).code,
    'CONTENT_VERSION_MISMATCH',
  );
});

test('records item and lesson completion idempotently', async (t) => {
  const call = await start(t);
  const completion = { method: 'PUT', body: requests.completeItem };
  assert.equal(
    (await call(`${lessonPath}/completion`, { ...completion, status: 409 }))
      .code,
    'COURSE_REQUIREMENTS_NOT_MET',
  );
  const video = await call(videoPath, {
    ...completion,
    schema: 'ItemProgressData',
  });
  assert.equal(video.status, 'COMPLETED');
  assert.deepEqual(await call(videoPath, completion), video);
  const lesson = await call(`${lessonPath}/completion`, {
    ...completion,
    schema: 'LessonProgressData',
  });
  assert.equal(lesson.status, 'COMPLETED');
  assert.deepEqual(
    await call(`${lessonPath}/progress`, { schema: 'LessonProgressData' }),
    lesson,
  );
  const progress = await call(`${coursePath}/progress`);
  assert.equal(progress.completedRequiredItems, 1);
  assert.equal(progress.progressPercent, 50);
  const chapterAccess = await call(`${coursePath}/chapters/access`, {
    schema: 'CourseChapterAccessData',
  });
  assert.deepEqual(
    chapterAccess.chapters.map(
      ({ completedLessons, totalLessons, progressPercent, status }) => [
        completedLessons,
        totalLessons,
        progressPercent,
        status,
      ],
    ),
    [
      [1, 1, 100, 'UNLOCKED'],
      [0, 1, 0, 'LOCKED'],
    ],
  );
});

test('keeps the next chapter locked after a failed grade and opens it after a pass', async (t) => {
  const call = await start(t);
  const access = async () =>
    (
      await call(`${coursePath}/chapters/access`, {
        schema: 'CourseChapterAccessData',
      })
    ).chapters;
  const completion = { method: 'PUT', body: requests.completeItem };
  const applyGrade = (event) =>
    call('/__mock/events', {
      method: 'POST',
      body: { event },
      schema: 'ProgressSyncData',
    });
  const syncPath = `${base}/attempts/${quiz.attemptAccess.attemptId}/sync`;

  assert.deepEqual(
    (await access()).map(({ status }) => status),
    ['UNLOCKED', 'LOCKED'],
  );
  assert.equal(
    (await call(readingPath, { ...completion, status: 403 })).code,
    'PREREQUISITE_NOT_COMPLETED',
  );
  await call(videoPath, completion);
  await applyGrade('chapterAttempt79');
  assert.equal((await access())[1].reason, 'PREVIOUS_CHAPTER_NOT_COMPLETED');
  const receipt = await applyGrade('chapterAttempt80');
  assert.deepEqual(
    (await access()).map(({ status }) => status),
    ['COMPLETED', 'UNLOCKED'],
  );
  assert.deepEqual(await applyGrade('chapterAttempt80'), receipt);

  await call(readingPath, completion);
  const waiting = await call(`${coursePath}/progress`);
  assert.equal(waiting.progressPercent, 100);
  assert.equal(waiting.status, 'IN_PROGRESS');
  assert.deepEqual(
    await call(syncPath, { schema: 'ProgressSyncData' }),
    expected.syncPending,
  );
  const final = await applyGrade('attemptGraded');
  assert.deepEqual(await call(syncPath), final);
  assert.equal((await call(`${coursePath}/progress`)).status, 'IN_PROGRESS');
  await call(`${lessonPath}/completion`, completion);
  await call(
    `${base}/lessons/${chapter2.lessons[0].id}/completion`,
    completion,
  );
  assert.equal((await call(`${coursePath}/progress`)).status, 'COMPLETED');
});

test('saves a checkpoint without changing completion', async (t) => {
  const call = await start(t);
  assert.equal(await call(`${coursePath}/resume`), null);
  const save = { method: 'PUT', body: requests.saveResume };
  const checkpoint = await call(`${coursePath}/resume`, {
    ...save,
    schema: 'LearningResumeData',
  });
  assert.equal(checkpoint.revision, 1);
  assert.deepEqual(await call(`${coursePath}/resume`), checkpoint);
  assert.equal(
    (await call(`${coursePath}/resume`, { ...save, status: 409 })).code,
    'REVISION_CONFLICT',
  );
  assert.equal(
    (
      await call(`${coursePath}/resume`, {
        method: 'PUT',
        body: requests.resumeChapter2,
        status: 403,
      })
    ).code,
    'PREREQUISITE_NOT_COMPLETED',
  );
  assert.deepEqual(await call(`${coursePath}/progress`), expected.initial);
});
