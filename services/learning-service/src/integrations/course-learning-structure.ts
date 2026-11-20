import type {
  CourseLearningStructure,
  EnrollmentSnapshotData,
  RequiredAssessment,
} from '@lms/contracts';
import { apiError } from '../common/api-error';

function normalizeAssessment(assessment: RequiredAssessment) {
  return { ...assessment, quizId: assessment.quizId.toLowerCase() };
}

export function validateCourseStructure(
  { outline, completionPolicy }: CourseLearningStructure,
  enrollment: EnrollmentSnapshotData,
): CourseLearningStructure {
  const courseId = enrollment.courseId.toLowerCase();
  const invalid = () =>
    apiError(
      'SERVICE_UNAVAILABLE',
      'Course returned content outside the enrolled snapshot',
    );
  const chapterIds = new Set<string>();
  const lessonIds = new Set<string>();
  const itemChapters = new Map<string, string>();

  const chapters = outline.chapters.map((chapter) => {
    const chapterId = chapter.id.toLowerCase();
    if (
      chapter.courseId.toLowerCase() !== courseId ||
      chapterIds.has(chapterId)
    )
      throw invalid();
    chapterIds.add(chapterId);
    const lessons = chapter.lessons.map((lesson) => {
      const lessonId = lesson.id.toLowerCase();
      if (
        lesson.courseId.toLowerCase() !== courseId ||
        lesson.chapterId.toLowerCase() !== chapterId ||
        lessonIds.has(lessonId)
      )
        throw invalid();
      lessonIds.add(lessonId);
      const items = lesson.items.map((item) => {
        const itemId = item.id.toLowerCase();
        if (
          item.courseId.toLowerCase() !== courseId ||
          item.lessonId.toLowerCase() !== lessonId ||
          item.contentVersion !== enrollment.contentVersion ||
          itemChapters.has(itemId)
        )
          throw invalid();
        const identity = { id: itemId, courseId, lessonId };
        itemChapters.set(identity.id, chapterId);
        return item.type === 'QUIZ'
          ? { ...item, ...identity, quizId: item.quizId.toLowerCase() }
          : { ...item, ...identity };
      });
      return { ...lesson, id: lessonId, courseId, chapterId, items };
    });
    return { ...chapter, id: chapterId, courseId, lessons };
  });

  const requiredItemIds = completionPolicy.requiredItemIds.map((id) =>
    id.toLowerCase(),
  );
  if (requiredItemIds.some((id) => !itemChapters.has(id))) throw invalid();

  const policyChapters = new Set<string>();
  const chapterPolicies = completionPolicy.chapterPolicies.map((policy) => {
    const chapterId = policy.chapterId.toLowerCase();
    const requiredItemIds = policy.requiredItemIds.map((id) =>
      id.toLowerCase(),
    );
    if (
      !chapterIds.has(chapterId) ||
      policyChapters.has(chapterId) ||
      requiredItemIds.some((id) => itemChapters.get(id) !== chapterId)
    )
      throw invalid();
    policyChapters.add(chapterId);
    return {
      ...policy,
      chapterId,
      requiredItemIds,
      requiredAssessments: policy.requiredAssessments.map(normalizeAssessment),
    };
  });

  return {
    outline: { ...outline, courseId, chapters },
    completionPolicy: {
      ...completionPolicy,
      courseId,
      requiredItemIds,
      requiredAssessments:
        completionPolicy.requiredAssessments.map(normalizeAssessment),
      chapterPolicies,
    },
  };
}
