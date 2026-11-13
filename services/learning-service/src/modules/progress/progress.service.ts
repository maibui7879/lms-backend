import { Injectable } from '@nestjs/common';
import type {
  ChapterAccessData,
  CompleteItemRequest,
  CourseChapterAccessData,
  CourseLearningStructure,
  CourseProgressData,
  EnrollmentSnapshotData,
  ItemProgressData,
} from '@lms/contracts';
import { apiError } from '../../common/api-error';
import { CourseClient } from '../../integrations/course.client';
import type { CourseRequestContext } from '../../integrations/course.client';
import { AssessmentAttemptsRepository } from '../progress-sync/repositories/assessment-attempts.repository';
import { ItemCompletionsRepository } from './repositories/item-completions.repository';
import { progressEvidence } from './rules/progress-evidence';
import type { ProgressEvidence } from './rules/progress-evidence';

@Injectable()
export class ProgressService {
  constructor(
    private readonly course: CourseClient,
    private readonly completions: ItemCompletionsRepository,
    private readonly assessments: AssessmentAttemptsRepository,
  ) {}

  async getCourseProgress(
    courseId: string,
    context: CourseRequestContext,
  ): Promise<CourseProgressData> {
    for await (const enrollment of this.course.enrollments(context)) {
      if (enrollment.courseId !== courseId) continue;
      const structure = await this.getStructure(enrollment, context);
      const { completionPolicy } = structure;
      const evidence = await this.getEvidence(enrollment, structure);
      const requiredIds = new Set(completionPolicy.requiredItemIds);
      const totalRequiredItems = requiredIds.size;
      const completedRequiredItems = [...requiredIds].filter((id) =>
        evidence.completedItems.has(id),
      ).length;
      const enrolledAt = Date.parse(enrollment.enrolledAt);
      const updatedAt = this.latestTime(evidence.activityTimes, enrolledAt);
      const totalRequiredAssessments =
        completionPolicy.requiredAssessments.length;
      const passedAssessments = completionPolicy.requiredAssessments
        .map(evidence.passedAt)
        .filter((date) => date !== undefined);
      const chapterRequiredIds = new Set(
        completionPolicy.chapterPolicies.flatMap(
          ({ requiredItemIds }) => requiredItemIds,
        ),
      );
      const chapterAccess = this.chapterAccess(structure, evidence);
      const courseComplete =
        completedRequiredItems === totalRequiredItems &&
        passedAssessments.length === totalRequiredAssessments &&
        completionPolicy.chapterPolicies.every(({ chapterId }) =>
          chapterAccess.some(
            (chapter) =>
              chapter.chapterId === chapterId && chapter.status === 'COMPLETED',
          ),
        );
      let completedAt: string | null = null;
      if (courseComplete) {
        const completionTimes = [...passedAssessments];
        for (const [id, time] of evidence.completedItems) {
          if (requiredIds.has(id) || chapterRequiredIds.has(id))
            completionTimes.push(time);
        }
        for (const policy of completionPolicy.chapterPolicies) {
          for (const assessment of policy.requiredAssessments) {
            const passedAt = evidence.passedAt(assessment);
            if (passedAt) completionTimes.push(passedAt);
          }
        }
        completedAt = this.latestTime(completionTimes, enrolledAt);
      }
      return {
        userId: enrollment.userId,
        courseId,
        enrollmentId: enrollment.enrollmentId,
        contentVersion: enrollment.contentVersion,
        status: courseComplete
          ? 'COMPLETED'
          : evidence.activityTimes.length
            ? 'IN_PROGRESS'
            : 'NOT_STARTED',
        completedRequiredItems,
        totalRequiredItems,
        progressPercent: totalRequiredItems
          ? (completedRequiredItems / totalRequiredItems) * 100
          : 0,
        passedRequiredAssessments: passedAssessments.length,
        totalRequiredAssessments,
        completedAt,
        updatedAt,
      };
    }
    throw apiError('ENROLLMENT_REQUIRED', 'Course access is required');
  }

  async getCourseChapterAccess(
    courseId: string,
    context: CourseRequestContext,
  ): Promise<CourseChapterAccessData> {
    for await (const enrollment of this.course.enrollments(context)) {
      if (enrollment.courseId !== courseId) continue;
      const structure = await this.getStructure(enrollment, context);
      const evidence = await this.getEvidence(enrollment, structure);
      return {
        courseId,
        contentVersion: enrollment.contentVersion,
        chapters: this.chapterAccess(structure, evidence),
      };
    }
    throw apiError('ENROLLMENT_REQUIRED', 'Course access is required');
  }

  async completeItem(
    itemId: string,
    body: CompleteItemRequest,
    context: CourseRequestContext,
  ): Promise<ItemProgressData> {
    let missingVersion = false;
    for await (const enrollment of this.course.enrollments(context)) {
      const structure = await this.course.structure(enrollment, context);
      if (!this.matchesVersion(enrollment, structure)) {
        missingVersion = true;
        continue;
      }
      const { outline, completionPolicy } = structure;
      const chapters = outline.chapters.toSorted((a, b) => a.order - b.order);
      const items = chapters.flatMap((chapter) =>
        chapter.lessons
          .toSorted((a, b) => a.order - b.order)
          .flatMap((lesson) =>
            lesson.items
              .toSorted((a, b) => a.order - b.order)
              .map((item) => ({ item, chapterId: chapter.id })),
          ),
      );
      const index = items.findIndex(({ item }) => item.id === itemId);
      if (index === -1) continue;
      if (body.contentVersion !== enrollment.contentVersion) {
        throw apiError(
          'CONTENT_VERSION_MISMATCH',
          'Use the enrolled contentVersion',
        );
      }
      const { item, chapterId } = items[index];
      if (item.type === 'QUIZ')
        throw apiError('FORBIDDEN', 'Quiz completion requires a graded result');

      const evidence = await this.getEvidence(enrollment, structure);
      const chapterBlocked = this.chapterAccess(structure, evidence).some(
        (chapter) =>
          chapter.chapterId === chapterId && chapter.status === 'LOCKED',
      );
      const itemBlocked =
        completionPolicy.sequence === 'SEQUENTIAL' &&
        items
          .slice(0, index)
          .some(
            ({ item }) =>
              completionPolicy.requiredItemIds.includes(item.id) &&
              !evidence.completedItems.has(item.id),
          );
      if (chapterBlocked || itemBlocked) {
        throw apiError(
          'PREREQUISITE_NOT_COMPLETED',
          'Complete the previous requirements first',
        );
      }

      const result = await this.completions.complete(
        enrollment.enrollmentId,
        enrollment.contentVersion,
        itemId,
      );
      return {
        learningItemId: itemId,
        contentVersion: enrollment.contentVersion,
        status: 'COMPLETED',
        completedAt: result.completedAt.toISOString(),
      };
    }
    if (missingVersion)
      throw apiError(
        'CONTENT_VERSION_MISMATCH',
        'An enrolled content version is unavailable',
      );
    throw apiError('NOT_FOUND', 'Item not found in an enrolled course');
  }

  private chapterAccess(
    { outline, completionPolicy }: CourseLearningStructure,
    { completedItems, passedAt }: ProgressEvidence,
  ): ChapterAccessData[] {
    const policies = new Map(
      completionPolicy.chapterPolicies.map((policy) => [
        policy.chapterId,
        policy,
      ]),
    );
    let unlocked = true;
    return outline.chapters
      .toSorted((a, b) => a.order - b.order)
      .map(({ id, order }) => {
        const chapter = {
          chapterId: id,
          order,
          contentVersion: outline.contentVersion,
        };
        if (!unlocked)
          return {
            ...chapter,
            status: 'LOCKED',
            reason: 'PREVIOUS_CHAPTER_NOT_COMPLETED',
          };

        const policy = policies.get(id);
        if (!policy) return { ...chapter, status: 'UNLOCKED', reason: null };

        const completed =
          policy.requiredAssessments.every((assessment) =>
            passedAt(assessment),
          ) &&
          policy.requiredItemIds.every((itemId) => completedItems.has(itemId));
        unlocked = completed;
        return {
          ...chapter,
          status: completed ? 'COMPLETED' : 'UNLOCKED',
          reason: null,
        };
      });
  }

  private async getEvidence(
    enrollment: EnrollmentSnapshotData,
    structure: CourseLearningStructure,
  ): Promise<ProgressEvidence> {
    const [completions, attempts] = await Promise.all([
      this.completions.list(enrollment.enrollmentId, enrollment.contentVersion),
      this.assessments.list(enrollment),
    ]);
    return progressEvidence(structure, completions, attempts);
  }

  private latestTime(times: Date[], startingAt: number): string {
    const time = times.reduce(
      (latest, date) => Math.max(latest, date.getTime()),
      startingAt,
    );
    return new Date(time).toISOString();
  }

  private async getStructure(
    enrollment: EnrollmentSnapshotData,
    context: CourseRequestContext,
  ): Promise<CourseLearningStructure> {
    const structure = await this.course.structure(enrollment, context);
    if (!this.matchesVersion(enrollment, structure)) {
      throw apiError(
        'CONTENT_VERSION_MISMATCH',
        'The enrolled course version is unavailable',
      );
    }
    return structure;
  }

  private matchesVersion(
    enrollment: EnrollmentSnapshotData,
    structure: CourseLearningStructure,
  ): boolean {
    const { outline, completionPolicy } = structure;
    if (
      outline.courseId !== enrollment.courseId ||
      completionPolicy.courseId !== enrollment.courseId
    ) {
      throw apiError(
        'SERVICE_UNAVAILABLE',
        'Course returned the wrong learning structure',
      );
    }
    return (
      outline.contentVersion === enrollment.contentVersion &&
      completionPolicy.contentVersion === enrollment.contentVersion
    );
  }
}
