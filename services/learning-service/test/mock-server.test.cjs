const assert = require('node:assert/strict');
const { once } = require('node:events');
const { test } = require('node:test');
const { parseContract } = require('@lms/contracts');
const { createLearningMockServer } = require('./mock-server.cjs');
const { course, quiz } = require('./fixtures/learning-providers.mock.json');
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

async function start(t) {
  const server = createLearningMockServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));

  return async function call(
    path,
    { method = 'GET', body, user = 'studentB', status = 200, schema } = {},
  ) {
    const headers = { 'X-Request-Id': 'learning-mock-test' };
    if (user) headers['X-Mock-User'] = user;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}${path}`,
      {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      },
    );
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
