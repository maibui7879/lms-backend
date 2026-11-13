const { createServer } = require('node:http');
const { randomUUID } = require('node:crypto');
const {
  ContractValidationError,
  ENDPOINTS,
  ERROR_HTTP_STATUS,
  parseContract,
} = require('@lms/contracts');
const {
  identity,
  course,
  quiz,
} = require('./fixtures/learning-providers.mock.json');
const { expected } = require('./fixtures/learning-scenarios.mock.json');

const enrollment = parseContract('EnrollmentSnapshotData', course.enrollment);
const { outline, completionPolicy } = parseContract(
  'CourseLearningStructure',
  course.structure,
);
const { courseId, userId, contentVersion } = enrollment;
const chapters = outline.chapters.toSorted((a, b) => a.order - b.order);
const lessons = chapters.flatMap((chapter) =>
  chapter.lessons.toSorted((a, b) => a.order - b.order),
);
const items = lessons.flatMap((lesson) =>
  lesson.items.toSorted((a, b) => a.order - b.order),
);
const events = new Map(
  ['chapterAttempt79', 'chapterAttempt80', 'attemptGraded'].map((name) => [
    name,
    parseContract('AttemptGradedV2Event', quiz[name]),
  ]),
);

class MockApiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

async function readJson(request) {
  let body = '';
  let tooLarge = false;
  request.setEncoding('utf8');
  for await (const chunk of request) {
    if (tooLarge) continue;
    body += chunk;
    tooLarge = body.length > 16384;
  }
  if (tooLarge)
    throw new MockApiError('VALIDATION_ERROR', 'JSON body is too large');
  try {
    return JSON.parse(body);
  } catch {
    throw new MockApiError('VALIDATION_ERROR', 'Expected a JSON body');
  }
}

function send(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(body));
}

function requireResource(resource) {
  if (!resource)
    throw new MockApiError('NOT_FOUND', 'Resource not found in the fixture');
  return resource;
}

function requireVersion(version) {
  if (version !== contentVersion) {
    throw new MockApiError(
      'CONTENT_VERSION_MISMATCH',
      'Use the enrolled contentVersion',
    );
  }
}

function createLearningMockServer() {
  const completedItems = new Map();
  const completedLessons = new Map();
  const receipts = new Map();
  const passedAssessments = new Set();
  let checkpoint = null;
  let updatedAt = expected.initial.updatedAt;
  let completedAt = null;

  const assessmentKey = ({ quizId, assessmentVersion }) =>
    `${quizId}:${assessmentVersion}`;
  const isPassed = (assessment) =>
    passedAssessments.has(assessmentKey(assessment));
  const requiredAssessments = [
    ...completionPolicy.requiredAssessments,
    ...completionPolicy.chapterPolicies.flatMap(
      (policy) => policy.requiredAssessments,
    ),
  ];

  function chapterAccess() {
    let unlocked = true;
    return {
      courseId,
      contentVersion,
      chapters: chapters.map(({ id, order }) => {
        const policy = completionPolicy.chapterPolicies.find(
          ({ chapterId }) => chapterId === id,
        );
        const done =
          unlocked &&
          Boolean(policy) &&
          policy.requiredItemIds.every((itemId) =>
            completedItems.has(itemId),
          ) &&
          policy.requiredAssessments.every(isPassed);
        const access = {
          chapterId: id,
          order,
          contentVersion,
          status: done ? 'COMPLETED' : unlocked ? 'UNLOCKED' : 'LOCKED',
          reason: unlocked ? null : 'PREVIOUS_CHAPTER_NOT_COMPLETED',
        };
        unlocked = unlocked && (!policy || done);
        return access;
      }),
    };
  }

  function updateProgress(time) {
    updatedAt = time;
    const access = chapterAccess().chapters;
    if (
      !completedAt &&
      completionPolicy.requiredItemIds.every((id) => completedItems.has(id)) &&
      completionPolicy.requiredAssessments.every(isPassed) &&
      completionPolicy.chapterPolicies.every(({ chapterId }) =>
        access.some(
          (chapter) =>
            chapter.chapterId === chapterId && chapter.status === 'COMPLETED',
        ),
      )
    )
      completedAt = time;
  }

  function requireItemAccess(item) {
    const lesson = lessons.find(({ id }) => id === item.lessonId);
    const access = chapterAccess().chapters.find(
      ({ chapterId }) => chapterId === lesson.chapterId,
    );
    const previous = items.slice(0, items.indexOf(item));
    if (
      access.status === 'LOCKED' ||
      (completionPolicy.sequence === 'SEQUENTIAL' &&
        previous.some(
          ({ id, required }) => required && !completedItems.has(id),
        ))
    )
      throw new MockApiError(
        'PREREQUISITE_NOT_COMPLETED',
        'Complete the previous requirements first',
      );
  }

  function itemProgress({ id }) {
    const time = completedItems.get(id) ?? null;
    return {
      learningItemId: id,
      contentVersion,
      status: time ? 'COMPLETED' : 'NOT_STARTED',
      completedAt: time,
    };
  }

  function lessonProgress(lesson) {
    const time = completedLessons.get(lesson.id) ?? null;
    return {
      userId,
      courseId,
      lessonId: lesson.id,
      contentVersion,
      status: time
        ? 'COMPLETED'
        : lesson.items.some(({ id }) => completedItems.has(id))
          ? 'IN_PROGRESS'
          : 'NOT_STARTED',
      completedAt: time,
      items: lesson.items.map(itemProgress),
    };
  }

  const handlers = {
    getCourseProgress() {
      const totalRequiredItems = completionPolicy.requiredItemIds.length;
      const completedRequiredItems = completionPolicy.requiredItemIds.filter(
        (id) => completedItems.has(id),
      ).length;
      return {
        ...expected.initial,
        status: completedAt
          ? 'COMPLETED'
          : completedItems.size || receipts.size
            ? 'IN_PROGRESS'
            : 'NOT_STARTED',
        completedRequiredItems,
        totalRequiredItems,
        progressPercent: totalRequiredItems
          ? (completedRequiredItems * 100) / totalRequiredItems
          : 0,
        passedRequiredAssessments:
          completionPolicy.requiredAssessments.filter(isPassed).length,
        totalRequiredAssessments: completionPolicy.requiredAssessments.length,
        completedAt,
        updatedAt,
      };
    },
    getCourseChapterAccess: chapterAccess,
    getLessonProgress(id) {
      return lessonProgress(
        requireResource(lessons.find((lesson) => lesson.id === id)),
      );
    },
    completeItem(id, body) {
      requireVersion(body.contentVersion);
      const item = requireResource(items.find((row) => row.id === id));
      requireItemAccess(item);
      if (item.type === 'QUIZ')
        throw new MockApiError(
          'FORBIDDEN',
          'Quiz completion requires a graded result',
        );
      if (!completedItems.has(id)) {
        const time = new Date().toISOString();
        completedItems.set(id, time);
        updateProgress(time);
      }
      return itemProgress(item);
    },
    completeLesson(id, body) {
      requireVersion(body.contentVersion);
      const lesson = requireResource(lessons.find((row) => row.id === id));
      const access = chapterAccess().chapters.find(
        ({ chapterId }) => chapterId === lesson.chapterId,
      );
      if (access.status === 'LOCKED')
        throw new MockApiError(
          'PREREQUISITE_NOT_COMPLETED',
          'Chapter is locked',
        );
      if (
        lesson.items.some(
          (item) => item.required && !completedItems.has(item.id),
        )
      ) {
        throw new MockApiError(
          'COURSE_REQUIREMENTS_NOT_MET',
          'Complete the required items first',
        );
      }
      if (!completedLessons.has(id))
        completedLessons.set(id, new Date().toISOString());
      return lessonProgress(lesson);
    },
    getResume() {
      return checkpoint;
    },
    saveResume(id, body) {
      requireVersion(body.contentVersion);
      const item = items.find(
        (row) =>
          row.id === body.learningItemId && row.lessonId === body.lessonId,
      );
      if (!item)
        throw new MockApiError(
          'INVALID_LESSON_RELATION',
          'Item does not belong to the lesson',
        );
      requireItemAccess(item);
      if (body.expectedRevision !== (checkpoint?.revision ?? 0)) {
        throw new MockApiError(
          'REVISION_CONFLICT',
          'Reload the latest checkpoint',
        );
      }
      const { lessonId, learningItemId, positionSeconds } = body;
      const validPosition =
        item.type === 'VIDEO'
          ? positionSeconds !== null &&
            positionSeconds >= 0 &&
            positionSeconds <= item.durationSeconds
          : positionSeconds === null;
      if (!validPosition)
        throw new MockApiError(
          'VALIDATION_ERROR',
          'Position is invalid for the item',
        );
      checkpoint = {
        userId,
        courseId: id,
        lessonId,
        learningItemId,
        contentVersion,
        positionSeconds,
        updatedAt: new Date().toISOString(),
        revision: body.expectedRevision + 1,
      };
      return checkpoint;
    },
    getProgressSync(id) {
      const event = requireResource(
        [...events.values()].find(({ payload }) => payload.attemptId === id),
      );
      return (
        receipts.get(event.eventId) ?? {
          attemptId: id,
          eventId: event.eventId,
          status: 'PENDING',
          updatedAt: null,
          error: null,
        }
      );
    },
  };

  function applyFixtureEvent(name) {
    const { eventId, payload } = requireResource(events.get(name));
    if (receipts.has(eventId)) return receipts.get(eventId);
    const time = new Date().toISOString();
    const receipt = {
      attemptId: payload.attemptId,
      eventId,
      status: 'SYNCED',
      updatedAt: time,
      error: null,
    };
    parseContract('ProgressSyncData', receipt);
    const assessment = requiredAssessments.find(
      (row) => assessmentKey(row) === assessmentKey(payload),
    );
    if (
      assessment &&
      payload.passed &&
      assessment.passingScorePercent === payload.passingScorePercent
    ) {
      passedAssessments.add(assessmentKey(payload));
      for (const item of items) {
        if (
          item.type === 'QUIZ' &&
          item.quizId === payload.quizId &&
          item.assessmentVersion === payload.assessmentVersion
        ) {
          if (!completedItems.has(item.id)) completedItems.set(item.id, time);
        }
      }
    }
    receipts.set(eventId, receipt);
    updateProgress(time);
    return receipt;
  }

  const routes = ENDPOINTS.filter(
    ({ service, operationId }) =>
      service === 'learning' && Object.hasOwn(handlers, operationId),
  ).map((endpoint) => ({
    ...endpoint,
    pattern: new RegExp(`^${endpoint.path.replace('{id}', '([^/]+)')}$`),
  }));
  return createServer(async (request, response) => {
    const incoming = request.headers['x-request-id'];
    const requestId =
      typeof incoming === 'string' && /^[A-Za-z0-9._-]{1,128}$/.test(incoming)
        ? incoming
        : randomUUID();
    response.setHeader('X-Request-Id', requestId);
    try {
      const url = new URL(request.url, 'http://localhost');
      const method = request.method.toLowerCase();
      const mockEvent = method === 'post' && url.pathname === '/__mock/events';
      const route = routes.find(
        (endpoint) =>
          endpoint.method === method && endpoint.pattern.test(url.pathname),
      );
      if (!route && !mockEvent)
        throw new MockApiError('NOT_FOUND', 'Mock route not found');
      const name = request.headers['x-mock-user'];
      if (typeof name !== 'string' || !Object.hasOwn(identity, name)) {
        throw new MockApiError(
          'UNAUTHORIZED',
          'Use a fixture identity in X-Mock-User',
        );
      }
      if (identity[name].id !== userId) {
        throw new MockApiError(
          route?.access === 'ATTEMPT_OWNER'
            ? 'NOT_ATTEMPT_OWNER'
            : 'ENROLLMENT_REQUIRED',
          'Resource belongs to the enrolled learner',
        );
      }
      if (url.search)
        throw new MockApiError(
          'VALIDATION_ERROR',
          'Unexpected query parameters',
        );

      let data;
      if (mockEvent) {
        const body = await readJson(request);
        if (
          !body ||
          typeof body.event !== 'string' ||
          Object.keys(body).length !== 1
        ) {
          throw new MockApiError(
            'VALIDATION_ERROR',
            'Expected an event fixture name',
          );
        }
        data = applyFixtureEvent(body.event);
      } else {
        const id = parseContract('Uuid', route.pattern.exec(url.pathname)[1]);
        if (route.path.includes('/courses/')) requireResource(id === courseId);
        const body = route.request
          ? parseContract(route.request, await readJson(request))
          : undefined;
        data = handlers[route.operationId](id, body);
        if (data !== null || !route.nullable)
          parseContract(route.response, data);
      }
      send(response, route?.success ?? 200, { data, meta: { requestId } });
    } catch (error) {
      const validation = error instanceof ContractValidationError;
      const expected = error instanceof MockApiError || validation;
      const code = validation
        ? 'VALIDATION_ERROR'
        : expected
          ? error.code
          : 'INTERNAL_ERROR';
      send(response, ERROR_HTTP_STATUS[code], {
        error: {
          code,
          message: expected ? error.message : 'Unexpected mock server error',
          details: {},
        },
        requestId,
        timestamp: new Date().toISOString(),
      });
    }
  });
}

if (require.main === module) {
  const port = Number(process.env.MOCK_PORT ?? 3104);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('MOCK_PORT must be a valid port');
  createLearningMockServer().listen(port, '127.0.0.1', () => {
    console.log(`Learning mock API listening on http://127.0.0.1:${port}`);
  });
}

module.exports = { createLearningMockServer };
