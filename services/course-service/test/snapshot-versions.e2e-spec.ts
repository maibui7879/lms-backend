import { InternalService } from '../src/modules/internal/internal.service';

describe('Published course snapshot selection', () => {
  const courses = { findOneBy: jest.fn() };
  const revisions = { findOneBy: jest.fn() };
  const chapters = { find: jest.fn() };
  const lessons = { find: jest.fn() };
  const items = { find: jest.fn() };
  const policies = { getForInternal: jest.fn() };
  const service = new InternalService(
    courses as never,
    revisions as never,
    chapters as never,
    lessons as never,
    items as never,
    {} as never,
    policies as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    courses.findOneBy.mockResolvedValue({
      id: 'course',
      contentVersion: 5,
      publishedRevisionId: 'revision',
      initialPublishedContentVersion: 3,
    });
    revisions.findOneBy.mockResolvedValue(null);
    chapters.find.mockResolvedValue([]);
    lessons.find.mockResolvedValue([]);
    items.find.mockResolvedValue([]);
    policies.getForInternal.mockImplementation(
      (_id: string, contentVersion: number) => ({ contentVersion }),
    );
  });

  it('does not label original content as a missing intermediate version', async () => {
    await expect(
      service.getLearningStructure('course', { contentVersion: 4 }),
    ).rejects.toMatchObject({
      response: { code: 'CONTENT_VERSION_UNAVAILABLE' },
    });
    expect(chapters.find).not.toHaveBeenCalled();
  });

  it('still serves the original published snapshot after later revisions', async () => {
    const result = await service.getLearningStructure('course', {
      contentVersion: 3,
    });
    expect(result.outline.contentVersion).toBe(3);
    expect(policies.getForInternal).toHaveBeenCalledWith('course', 3);
  });

  it('selects the specific published revision rather than the current revision', async () => {
    revisions.findOneBy.mockResolvedValue({ id: 'older-revision' });
    const result = await service.getLearningStructure('course', {
      contentVersion: 4,
    });
    expect(result.outline.revisionId).toBe('older-revision');
    expect(chapters.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { courseId: 'course', revisionId: 'older-revision' },
      }),
    );
  });
});
