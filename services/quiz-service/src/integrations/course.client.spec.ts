import type { CourseOutlineData, CreateQuizRequest } from '@lms/contracts';
import { CourseClient } from './course.client';

const courseId = '11111111-1111-4111-8111-111111111111';
const chapterId = '22222222-2222-4222-8222-222222222222';
const lessonId = '33333333-3333-4333-8333-333333333333';
const revisionId = '44444444-4444-4444-8444-444444444444';
const request: CreateQuizRequest = {
  courseId,
  chapterId,
  lessonId,
  placement: 'LESSON',
  title: 'Lesson quiz',
  policy: {
    quizType: 'GRADED',
    durationSeconds: 900,
    passingScorePercent: 70,
    maxAttempts: 2,
    requiredForCompletion: true,
    shuffleQuestions: false,
    shuffleChoices: false,
    reviewPolicy: 'AFTER_SUBMISSION',
  },
};
const outline: CourseOutlineData = {
  courseId,
  revisionId,
  contentVersion: 1,
  chapters: [
    {
      id: chapterId,
      courseId,
      revisionId,
      title: 'Chapter',
      order: 1,
      version: 1,
      endSectionQuiz: null,
      lessons: [
        {
          id: lessonId,
          courseId,
          revisionId,
          chapterId,
          title: 'Lesson',
          order: 1,
          version: 1,
          items: [],
        },
      ],
    },
  ],
};

describe('CourseClient', () => {
  const originalFetch = global.fetch;
  const originalCourseUrl = process.env.COURSE_URL;
  const originalMockAuth = process.env.MOCK_AUTH;
  const fetchMock = jest.fn();
  const context = {
    authorization: 'Bearer user.jwt.token',
    requestId: 'request-123',
  };
  const reviewsResponse = () =>
    new Response(
      JSON.stringify({
        data: { items: [], page: 1, limit: 1, total: 0 },
        meta: { requestId: 'course-request-123' },
      }),
      { status: 200 },
    );
  const outlineResponse = (data: unknown = outline, status = 200) =>
    new Response(
      JSON.stringify({
        data,
        meta: { requestId: 'course-request-123' },
      }),
      { status },
    );

  beforeEach(() => {
    process.env.COURSE_URL = 'http://course.test';
    process.env.MOCK_AUTH = 'false';
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  afterAll(() => {
    global.fetch = originalFetch;
    if (originalCourseUrl === undefined) delete process.env.COURSE_URL;
    else process.env.COURSE_URL = originalCourseUrl;
    if (originalMockAuth === undefined) delete process.env.MOCK_AUTH;
    else process.env.MOCK_AUTH = originalMockAuth;
  });

  it('checks ownership and placement using the authenticated Course APIs', async () => {
    fetchMock
      .mockResolvedValueOnce(reviewsResponse())
      .mockResolvedValueOnce(outlineResponse());

    await expect(
      new CourseClient().requireQuizPlacement(request, context),
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0].toString()).toBe(
      `http://course.test/api/v1/courses/${courseId}/reviews?page=1&limit=1`,
    );
    expect(fetchMock.mock.calls[0][1].headers).toEqual({
      Authorization: context.authorization,
      'X-Request-Id': context.requestId,
    });
  });

  it('rejects a course the instructor does not own', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 403 }));

    await expect(
      new CourseClient().requireQuizPlacement(request, context),
    ).rejects.toMatchObject({
      status: 403,
      response: {
        code: 'NOT_COURSE_OWNER',
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects a lesson that is not in the requested chapter', async () => {
    fetchMock.mockResolvedValueOnce(reviewsResponse()).mockResolvedValueOnce(
      outlineResponse({
        ...outline,
        chapters: [{ ...outline.chapters[0], lessons: [] }],
      }),
    );

    await expect(
      new CourseClient().requireQuizPlacement(request, context),
    ).rejects.toMatchObject({
      status: 422,
      response: {
        code: 'INVALID_LESSON_RELATION',
      },
    });
  });
});
