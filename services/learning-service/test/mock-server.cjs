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

function readPageQuery(searchParams) {
  const query = Object.fromEntries(
    [...new Set(searchParams.keys())].map((key) => {
      const values = searchParams.getAll(key);
      const number = Number(values[0]);
      const value =
        values.length === 1 &&
        /^[0-9]+$/.test(values[0]) &&
        Number.isSafeInteger(number)
          ? number
          : values;
      return [key, value];
    }),
  );
  const { page = 1, limit = 20 } = parseContract('PageQuery', query);
  return { page, limit };
}

function createLearningMockServer() {
  const mutableItems = structuredClone(items);
  const completedItems = new Map();
  const completionHistory = new Map();
  const invalidatedItems = new Map();
  const notices = new Map();
  const appliedMigrations = new Map();
  const completedLessons = new Map();
  const receipts = new Map();
  const syncedAttempts = new Map();
  const passedAssessments = new Set();
  let checkpoint = null;
  let updatedAt = expected.initial.updatedAt;
  let completedAt = null;
  const requiredLessonItems = new Set([
    ...completionPolicy.requiredItemIds,
    ...completionPolicy.chapterPolicies.flatMap(
      (policy) => policy.requiredItemIds,
    ),
  ]);
  const requiredLessons = lessons.filter((lesson) =>
    lesson.items.some(({ id }) => requiredLessonItems.has(id)),
  );

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

  function quizScores({ page, limit }, ownScores) {
    const summaries = new Map();
    for (const result of syncedAttempts.values()) {
      if (result.quizType !== 'GRADED') continue;
      if (
        ownScores &&
        Date.parse(result.gradedAt) < Date.parse(enrollment.enrolledAt)
      )
        continue;
      const key = assessmentKey(result);
      const previous = summaries.get(key);
      const scorePercent = (result.score / result.maxScore) * 100;
      summaries.set(key, {
        userId,
        courseId,
        quizId: result.quizId,
        assessmentVersion: result.assessmentVersion,
        gradedAttempts: (previous?.gradedAttempts ?? 0) + 1,
        bestScorePercent: Math.max(
          previous?.bestScorePercent ?? 0,
          scorePercent,
        ),
        passed: Boolean(previous?.passed || result.passed),
      });
    }
    const sorted = [...summaries.values()].sort(
      (a, b) =>
        a.quizId.localeCompare(b.quizId) ||
        a.assessmentVersion - b.assessmentVersion,
    );
    const offset = (page - 1) * limit;
    return {
      items: sorted.slice(offset, offset + limit),
      page,
      limit,
      total: sorted.length,
    };
  }

  function chapterAccess() {
    let unlocked = true;
    return {
      courseId,
      contentVersion,
      chapters: chapters.map(({ id, order, lessons }) => {
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
        const totalLessons = lessons.length;
        const completedLessonCount = lessons.filter(({ id }) =>
          completedLessons.has(id),
        ).length;
        const access = {
          chapterId: id,
          order,
          contentVersion,
          completedLessons: completedLessonCount,
          totalLessons,
          progressPercent: totalLessons
            ? (completedLessonCount / totalLessons) * 100
            : 0,
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

  function canAccessItem(item) {
    const lesson = lessons.find(({ id }) => id === item.lessonId);
    const access = chapterAccess().chapters.find(
      ({ chapterId }) => chapterId === lesson.chapterId,
    );
    const previous = items.slice(
      0,
      items.findIndex(({ id }) => id === item.id),
    );
    return (
      access.status !== 'LOCKED' &&
      (completionPolicy.sequence !== 'SEQUENTIAL' ||
        previous.every(
          ({ id }) => !requiredLessonItems.has(id) || completedItems.has(id),
        ))
    );
  }

  function requireItemAccess(item) {
    if (!canAccessItem(item))
      throw new MockApiError(
        'PREREQUISITE_NOT_COMPLETED',
        'Complete the previous requirements first',
      );
  }

  function itemProgress({ id }) {
    const time = completedItems.get(id) ?? completionHistory.get(id) ?? null;
    const invalidation = invalidatedItems.get(id);
    return {
      learningItemId: id,
      contentVersion,
      status: invalidation ? 'OUTDATED' : time ? 'COMPLETED' : 'NOT_STARTED',
      completedAt: time,
      invalidatedAt: invalidation?.invalidatedAt ?? null,
      invalidationReason: invalidation?.reason ?? notices.get(id) ?? null,
    };
  }

  function lessonProgress(lesson) {
    const time = completedLessons.get(lesson.id) ?? null;
    return {
      userId,
      courseId,
      lessonId: lesson.id,
      contentVersion,
      status: lesson.items.some(
        ({ id }) => requiredLessonItems.has(id) && invalidatedItems.has(id),
      )
        ? 'OUTDATED'
        : time
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
      const completedRequiredLessons = requiredLessons.filter(({ id }) =>
        completedLessons.has(id),
      ).length;
      return {
        ...expected.initial,
        status: [...invalidatedItems.keys()].some((id) =>
          requiredLessonItems.has(id),
        )
          ? 'OUTDATED'
          : completedAt
            ? 'COMPLETED'
            : completedItems.size || receipts.size || completedLessons.size
              ? 'IN_PROGRESS'
              : 'NOT_STARTED',
        completedRequiredItems,
        totalRequiredItems,
        progressPercent: totalRequiredItems
          ? (completedRequiredItems * 100) / totalRequiredItems
          : 0,
        completedRequiredLessons,
        totalRequiredLessons: requiredLessons.length,
        lessonProgressPercent: requiredLessons.length
          ? (completedRequiredLessons / requiredLessons.length) * 100
          : 0,
        passedRequiredAssessments:
          completionPolicy.requiredAssessments.filter(isPassed).length,
        totalRequiredAssessments: completionPolicy.requiredAssessments.length,
        completedAt,
        updatedAt,
      };
    },
    getDashboard(_id, _body, actor) {
      if (actor.id !== userId)
        return {
          courses: [],
          recentQuizzes: [],
          updatedAt: new Date().toISOString(),
        };

      const progress = handlers.getCourseProgress();
      const allDone =
        progress.status === 'COMPLETED' &&
        progress.completedRequiredLessons === progress.totalRequiredLessons;
      const lastActivityAt = new Date(
        Math.max(
          Date.parse(progress.updatedAt),
          Date.parse(checkpoint?.updatedAt ?? progress.updatedAt),
        ),
      ).toISOString();
      const recentQuizzes = [...syncedAttempts.values()]
        .filter((result) => result.quizType === 'GRADED')
        .sort(
          (a, b) =>
            Date.parse(b.gradedAt) - Date.parse(a.gradedAt) ||
            a.attemptId.localeCompare(b.attemptId) ||
            a.assessmentVersion - b.assessmentVersion,
        )
        .slice(0, 10)
        .map(
          ({
            attemptId,
            quizId,
            assessmentVersion,
            score,
            maxScore,
            passed,
            gradedAt,
          }) => ({
            attemptId,
            courseId,
            quizId,
            assessmentVersion,
            scorePercent: (score / maxScore) * 100,
            passed,
            gradedAt,
          }),
        );
      return {
        courses: [
          {
            ...progress,
            title: course.publishedCourse.title,
            nextStep: allDone ? null : nextStep(),
            lastActivityAt,
          },
        ],
        recentQuizzes,
        updatedAt: lastActivityAt,
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
      if (!completedItems.has(id) || invalidatedItems.has(id)) {
        const time = new Date().toISOString();
        invalidatedItems.delete(id);
        notices.delete(id);
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
          (item) =>
            requiredLessonItems.has(item.id) && !completedItems.has(item.id),
        )
      ) {
        throw new MockApiError(
          'COURSE_REQUIREMENTS_NOT_MET',
          'Complete the required items first',
        );
      }
      if (!completedLessons.has(id)) {
        const time = new Date().toISOString();
        completedLessons.set(id, time);
        updateProgress(time);
      }
      return lessonProgress(lesson);
    },
    getResume() {
      if (checkpoint)
        requireItemAccess(
          mutableItems.find(({ id }) => id === checkpoint.learningItemId),
        );
      return checkpoint;
    },
    saveResume(id, body) {
      requireVersion(body.contentVersion);
      const item = mutableItems.find(
        (row) =>
          row.id === body.learningItemId && row.lessonId === body.lessonId,
      );
      if (!item)
        throw new MockApiError(
          'INVALID_LESSON_RELATION',
          'Item does not belong to the lesson',
        );
      requireItemAccess(item);
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
      if (body.expectedRevision !== (checkpoint?.revision ?? 0)) {
        throw new MockApiError(
          'REVISION_CONFLICT',
          'Reload the latest checkpoint',
        );
      }
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
    migrateCourseItems(_id, body) {
      if (body.revisionId !== '00000000-0000-4000-8000-000000000901')
        throw new MockApiError(
          'INVALID_LESSON_RELATION',
          'Unknown fixture revision',
        );
      const replacements = [
        ['00000000-0000-4000-8000-000000000902', items[0].id],
        ['00000000-0000-4000-8000-000000000903', items[1].id],
      ];
      const changes = body.itemIds.map((id) => {
        const replacement = replacements.find(([targetId]) => targetId === id);
        if (!replacement)
          throw new MockApiError(
            'INVALID_LESSON_RELATION',
            'Unknown fixture item',
          );
        return replacement;
      });
      if (!changes.length)
        throw new MockApiError('VALIDATION_ERROR', 'Provide item IDs');
      for (const [targetId] of changes) {
        const key = `${body.revisionId}:${targetId}:${body.policy}`;
        if (
          appliedMigrations.has(key) &&
          appliedMigrations.get(key) !== body.reason
        )
          throw new MockApiError(
            'REVISION_CONFLICT',
            'Migration already has a different reason',
          );
      }
      for (const [targetId, sourceId] of changes) {
        const key = `${body.revisionId}:${targetId}:${body.policy}`;
        if (appliedMigrations.has(key)) {
          if (appliedMigrations.get(key) !== body.reason)
            throw new MockApiError(
              'REVISION_CONFLICT',
              'Migration already has a different reason',
            );
          continue;
        }
        notices.set(sourceId, body.reason);
        if (body.policy === 'REQUIRE_RECOMPLETION') {
          invalidatedItems.set(sourceId, {
            invalidatedAt: new Date().toISOString(),
            reason: body.reason,
          });
          if (completedItems.has(sourceId))
            completionHistory.set(sourceId, completedItems.get(sourceId));
          completedItems.delete(sourceId);
          const lesson = lessons.find(({ items }) =>
            items.some(({ id }) => id === sourceId),
          );
          if (requiredLessonItems.has(sourceId)) {
            completedLessons.delete(lesson.id);
            completedAt = null;
          }
          const item = mutableItems.find(({ id }) => id === sourceId);
          if (item.type === 'VIDEO') item.durationSeconds = 30;
          if (checkpoint?.learningItemId === sourceId)
            checkpoint = {
              ...checkpoint,
              positionSeconds: item.type === 'VIDEO' ? 0 : null,
            };
          updateProgress(new Date().toISOString());
        }
        appliedMigrations.set(key, body.reason);
      }
    },
    listMySyncedQuizScores(query) {
      return quizScores(query, true);
    },
    listCourseSyncedQuizScores(query) {
      return quizScores(query, false);
    },
  };

  function nextStep() {
    const itemStep = (lessonId, learningItemId, positionSeconds = null) => ({
      kind: 'LEARNING_ITEM',
      lessonId,
      learningItemId,
      positionSeconds,
    });
    if (
      checkpoint &&
      !completedItems.has(checkpoint.learningItemId) &&
      canAccessItem(
        mutableItems.find(({ id }) => id === checkpoint.learningItemId),
      )
    )
      return itemStep(
        checkpoint.lessonId,
        checkpoint.learningItemId,
        checkpoint.positionSeconds,
      );
    const quizStep = ({ quizId, assessmentVersion }) => ({
      kind: 'QUIZ',
      quizId,
      assessmentVersion,
    });
    for (const access of chapterAccess().chapters) {
      if (access.status === 'LOCKED') break;
      for (const lesson of lessons.filter(
        ({ chapterId }) => chapterId === access.chapterId,
      )) {
        const required = items.filter(
          ({ id, lessonId }) =>
            lessonId === lesson.id && requiredLessonItems.has(id),
        );
        const pending = required.find(({ id }) => !completedItems.has(id));
        if (pending) return itemStep(lesson.id, pending.id);
        if (required.length && !completedLessons.has(lesson.id))
          return { kind: 'COMPLETE_LESSON', lessonId: lesson.id };
      }
      const policy = completionPolicy.chapterPolicies.find(
        ({ chapterId }) => chapterId === access.chapterId,
      );
      const quiz = policy?.requiredAssessments.find((row) => !isPassed(row));
      if (quiz) return quizStep(quiz);
    }
    const quiz = completionPolicy.requiredAssessments.find(
      (row) => !isPassed(row),
    );
    return quiz ? quizStep(quiz) : null;
  }

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
    syncedAttempts.set(
      `${payload.attemptId}:${payload.assessmentVersion}`,
      payload,
    );
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
      const internal = route?.access === 'INTERNAL';
      if (
        internal &&
        request.headers.authorization !==
          `Bearer ${process.env.LEARNING_SERVICE_TOKEN ?? 'learning-mock-service-token'}`
      )
        throw new MockApiError(
          'UNAUTHORIZED',
          'A valid internal service credential is required',
        );
      const name = internal ? 'studentB' : request.headers['x-mock-user'];
      if (typeof name !== 'string' || !Object.hasOwn(identity, name)) {
        throw new MockApiError(
          'UNAUTHORIZED',
          'Use a fixture identity in X-Mock-User',
        );
      }
      const actor = identity[name];
      if (route?.access === 'COURSE_OWNER') {
        if (actor.role !== 'INSTRUCTOR' && actor.role !== 'ADMIN')
          throw new MockApiError(
            'FORBIDDEN',
            'An instructor or admin is required',
          );
        if (
          actor.role === 'INSTRUCTOR' &&
          actor.id !== course.publishedCourse.instructorId
        )
          throw new MockApiError(
            'NOT_COURSE_OWNER',
            'Course belongs to another instructor',
          );
      } else if (
        route?.operationId === 'listMySyncedQuizScores' &&
        actor.role !== 'STUDENT'
      ) {
        throw new MockApiError('FORBIDDEN', 'A student account is required');
      } else if (route?.access !== 'AUTHENTICATED' && actor.id !== userId) {
        throw new MockApiError(
          route?.access === 'ATTEMPT_OWNER'
            ? 'NOT_ATTEMPT_OWNER'
            : 'ENROLLMENT_REQUIRED',
          'Resource belongs to the enrolled learner',
        );
      }
      if (url.search && !route?.query)
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
        const [, rawId] = route.pattern.exec(url.pathname);
        const id =
          rawId === undefined ? undefined : parseContract('Uuid', rawId);
        if (route.path.includes('/courses/')) requireResource(id === courseId);
        const body = route.request
          ? parseContract(route.request, await readJson(request))
          : undefined;
        if (route.list) {
          data = handlers[route.operationId](readPageQuery(url.searchParams));
          for (const item of data.items) parseContract(route.response, item);
        } else {
          data = handlers[route.operationId](id, body, actor);
          if (route.response && (data !== null || !route.nullable))
            parseContract(route.response, data);
        }
      }
      if (route?.success === 204) response.writeHead(204).end();
      else send(response, route?.success ?? 200, { data, meta: { requestId } });
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
