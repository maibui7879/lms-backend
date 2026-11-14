import { Injectable } from '@nestjs/common';
import type {
  ChapterAccessData,
  CompleteItemRequest,
  CompleteLessonRequest,
  CourseChapterAccessData,
  CourseLearningStructure,
  CourseProgressData,
  EnrollmentSnapshotData,
  ItemProgressData,
  LearningDashboardCourse,
  LearningNextStep,
  LearningRecentQuiz,
  LearningResumeData,
  LessonOutline,
  LessonProgressData,
  SaveResumeRequest,
} from '@lms/contracts';
import { apiError } from '../../common/api-error';
import { CourseClient } from '../../integrations/course.client';
import type { CourseRequestContext } from '../../integrations/course.client';
import { AssessmentAttemptsRepository } from '../progress-sync/repositories/assessment-attempts.repository';
import { ItemCompletionsRepository } from './repositories/item-completions.repository';
import type { LearningResume } from './entities/learning-resume.entity';
import { LearningResumeRepository } from './repositories/learning-resume.repository';
import { LessonCompletionsRepository } from './repositories/lesson-completions.repository';
import {
  progressEvidence,
  requiredLessonItemIds,
  lessonCompletionValid,
  lessonInvalidatedAt,
  lessonMigrationGeneration,
} from './rules/progress-evidence';
import type { ProgressEvidence } from './rules/progress-evidence';
import { recentQuiz, sortRecentQuizzes } from './rules/recent-quiz';
import { CourseItemMigrationsRepository } from './repositories/course-item-migrations.repository';
import { applyItemMigrations, itemMigration } from './rules/item-migrations';
import type { LearningStructure } from './rules/item-migrations';

@Injectable()
export class ProgressService {
  constructor(
    private readonly course: CourseClient,
    private readonly completions: ItemCompletionsRepository,
    private readonly assessments: AssessmentAttemptsRepository,
    private readonly lessonCompletions: LessonCompletionsRepository,
    private readonly resumes: LearningResumeRepository,
    private readonly migrations: CourseItemMigrationsRepository,
  ) {}

  async getLessonProgress(
    lessonId: string,
    context: CourseRequestContext,
  ): Promise<LessonProgressData> {
    const { enrollment, structure, lesson } = await this.findLesson(
      lessonId,
      context,
    );
    const completion = await this.lessonCompletions.find({
      enrollmentId: enrollment.enrollmentId,
      contentVersion: enrollment.contentVersion,
      lessonId: lesson.id,
    });
    const evidence = await this.getEvidence(enrollment, structure);
    return this.lessonProgress(
      enrollment,
      lesson,
      evidence,
      completion?.completedAt,
      completion?.migrationCount,
    );
  }

  async completeLesson(
    lessonId: string,
    body: CompleteLessonRequest,
    context: CourseRequestContext,
  ): Promise<LessonProgressData> {
    const { enrollment, structure, lesson, chapterId, earlierLessons } =
      await this.findLesson(lessonId, context);
    const { enrollmentId, contentVersion } = enrollment;
    if (body.contentVersion !== contentVersion) {
      throw apiError(
        'CONTENT_VERSION_MISMATCH',
        'Use the enrolled contentVersion',
      );
    }

    const evidence = await this.getEvidence(enrollment, structure);
    const { completionPolicy } = structure;
    const requiredIds = requiredLessonItemIds(completionPolicy);
    const missingRequiredItem = ({ id }: { id: string }) =>
      requiredIds.has(id) && !evidence.completedItems.has(id);
    const chapterLocked = this.chapterAccess(structure, evidence).some(
      (chapter) =>
        chapter.chapterId === chapterId && chapter.status === 'LOCKED',
    );
    if (
      chapterLocked ||
      (completionPolicy.sequence === 'SEQUENTIAL' &&
        earlierLessons.some(({ lesson }) =>
          lesson.items.some(missingRequiredItem),
        ))
    ) {
      throw apiError(
        'PREREQUISITE_NOT_COMPLETED',
        'Complete the previous requirements first',
      );
    }
    if (lesson.items.some(missingRequiredItem)) {
      throw apiError(
        'COURSE_REQUIREMENTS_NOT_MET',
        'Complete the required items first',
      );
    }

    const completion = await this.lessonCompletions.complete(
      {
        enrollmentId,
        contentVersion,
        lessonId: lesson.id,
      },
      {
        courseId: enrollment.courseId,
        migrationCount: evidence.migrationCount,
      },
      lessonMigrationGeneration(lesson, evidence),
    );
    return this.lessonProgress(
      enrollment,
      lesson,
      evidence,
      completion.completedAt,
      completion.migrationCount,
    );
  }

  async getCourseProgress(
    courseId: string,
    context: CourseRequestContext,
  ): Promise<CourseProgressData> {
    const enrollment = await this.findCourseEnrollment(courseId, context);
    const { progress } = await this.loadCourseProgress(enrollment, context);
    return progress;
  }

  async dashboardCourse(
    enrollment: EnrollmentSnapshotData,
    title: string,
    context: CourseRequestContext,
  ): Promise<{
    course: LearningDashboardCourse;
    recentQuizzes: LearningRecentQuiz[];
  }> {
    const [{ structure, evidence, progress, completedLessons }, checkpoint] =
      await Promise.all([
        this.loadCourseProgress(enrollment, context),
        this.resumes.find(enrollment.enrollmentId, enrollment.contentVersion),
      ]);
    const allDone =
      progress.status === 'COMPLETED' &&
      progress.completedRequiredLessons === progress.totalRequiredLessons;
    const nextStep = allDone
      ? null
      : this.nextStep(structure, evidence, completedLessons, checkpoint);
    const lastActivityAt = this.latestTime(
      checkpoint ? [checkpoint.updatedAt] : [],
      Date.parse(progress.updatedAt),
    );
    return {
      course: { ...progress, title, lastActivityAt, nextStep },
      recentQuizzes: evidence.attempts
        .filter(({ result }) => result.quizType === 'GRADED')
        .map(({ result }) => recentQuiz(result))
        .sort(sortRecentQuizzes)
        .slice(0, 10),
    };
  }

  private async loadCourseProgress(
    enrollment: EnrollmentSnapshotData,
    context: CourseRequestContext,
  ) {
    const { courseId, contentVersion, enrollmentId } = enrollment;
    const structure = await this.getStructure(enrollment, context);
    const { completionPolicy } = structure;
    const [evidence, lessonCompletions] = await Promise.all([
      this.getEvidence(enrollment, structure),
      this.lessonCompletions.list(enrollmentId, contentVersion),
    ]);
    const courseLessons = this.orderedLessons(structure).map(
      ({ lesson }) => lesson,
    );
    const lessonIds = new Set(courseLessons.map(({ id }) => id));
    const finishedLessons = lessonCompletions.filter(
      ({ lessonId, completedAt, migrationCount }) =>
        lessonIds.has(lessonId) &&
        lessonCompletionValid(
          courseLessons.find(({ id }) => id === lessonId)!,
          completedAt,
          evidence,
          migrationCount,
        ),
    );
    const completedLessons = new Set(
      finishedLessons.map(({ lessonId }) => lessonId),
    );
    const requiredLessonItems = requiredLessonItemIds(completionPolicy);
    const requiredLessons = courseLessons.filter(({ items }) =>
      items.some(({ id }) => requiredLessonItems.has(id)),
    );
    const totalRequiredLessons = requiredLessons.length;
    const completedRequiredLessons = requiredLessons.filter(({ id }) =>
      completedLessons.has(id),
    ).length;
    const requiredIds = new Set(completionPolicy.requiredItemIds);
    const totalRequiredItems = requiredIds.size;
    const completedRequiredItems = [...requiredIds].filter((id) =>
      evidence.completedItems.has(id),
    ).length;
    const enrolledAt = Date.parse(enrollment.enrolledAt);
    const activityTimes = [
      ...evidence.activityTimes,
      ...finishedLessons.map(({ completedAt }) => completedAt),
    ];
    const updatedAt = this.latestTime(activityTimes, enrolledAt);
    const totalRequiredAssessments =
      completionPolicy.requiredAssessments.length;
    const passedAssessments = completionPolicy.requiredAssessments
      .map(evidence.passedAt)
      .filter((date) => date !== undefined);
    const chapterAccess = this.chapterAccess(structure, evidence);
    const courseComplete =
      completedRequiredLessons === totalRequiredLessons &&
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
      const requiredLessonIds = new Set(requiredLessons.map(({ id }) => id));
      completionTimes.push(
        ...finishedLessons
          .filter(({ lessonId }) => requiredLessonIds.has(lessonId))
          .map(({ completedAt }) => completedAt),
      );
      for (const [id, time] of evidence.completedItems) {
        if (requiredLessonItems.has(id)) completionTimes.push(time);
      }
      for (const policy of completionPolicy.chapterPolicies) {
        for (const assessment of policy.requiredAssessments) {
          const passedAt = evidence.passedAt(assessment);
          if (passedAt) completionTimes.push(passedAt);
        }
      }
      completedAt = this.latestTime(completionTimes, enrolledAt);
    }
    const assessmentRequirements = [
      ...completionPolicy.requiredAssessments,
      ...completionPolicy.chapterPolicies.flatMap(
        ({ requiredAssessments }) => requiredAssessments,
      ),
    ];
    const affectedIds = new Set(requiredLessonItems);
    for (const { item } of this.orderedItems(structure)) {
      if (
        item.type === 'QUIZ' &&
        assessmentRequirements.some(
          (assessment) =>
            assessment.quizId === item.quizId &&
            assessment.assessmentVersion === item.assessmentVersion,
        )
      )
        affectedIds.add(item.id);
    }
    const invalidatedRequired = [...affectedIds].map(
      (id) => evidence.itemStates.get(id)?.status,
    );
    const invalidatedStatus = invalidatedRequired.includes('RESET')
      ? 'RESET'
      : invalidatedRequired.includes('OUTDATED')
        ? 'OUTDATED'
        : null;
    const progress: CourseProgressData = {
      userId: enrollment.userId,
      courseId,
      enrollmentId: enrollment.enrollmentId,
      contentVersion: enrollment.contentVersion,
      status:
        invalidatedStatus ??
        (courseComplete
          ? 'COMPLETED'
          : activityTimes.length
            ? 'IN_PROGRESS'
            : 'NOT_STARTED'),
      completedRequiredItems,
      totalRequiredItems,
      progressPercent: totalRequiredItems
        ? (completedRequiredItems / totalRequiredItems) * 100
        : 0,
      completedRequiredLessons,
      totalRequiredLessons,
      lessonProgressPercent: totalRequiredLessons
        ? (completedRequiredLessons / totalRequiredLessons) * 100
        : 0,
      passedRequiredAssessments: passedAssessments.length,
      totalRequiredAssessments,
      completedAt,
      updatedAt,
    };
    return { structure, evidence, progress, completedLessons };
  }

  async getCourseChapterAccess(
    courseId: string,
    context: CourseRequestContext,
  ): Promise<CourseChapterAccessData> {
    for await (const enrollment of this.course.enrollments(context)) {
      if (enrollment.courseId !== courseId) continue;
      const structure = await this.getStructure(enrollment, context);
      const completedLessons = await this.lessonCompletions.list(
        enrollment.enrollmentId,
        enrollment.contentVersion,
      );
      const evidence = await this.getEvidence(enrollment, structure);
      const allLessons = this.orderedLessons(structure).map(
        ({ lesson }) => lesson,
      );
      const completedLessonIds = new Set(
        completedLessons
          .filter(({ lessonId, completedAt, migrationCount }) => {
            const lesson = allLessons.find(({ id }) => id === lessonId);
            return (
              lesson &&
              lessonCompletionValid(
                lesson,
                completedAt,
                evidence,
                migrationCount,
              )
            );
          })
          .map(({ lessonId }) => lessonId),
      );
      return {
        courseId,
        contentVersion: enrollment.contentVersion,
        chapters: this.chapterAccess(structure, evidence).map(
          ({ lessons, ...access }) => {
            const totalLessons = lessons.length;
            const completedLessons = lessons.filter(({ id }) =>
              completedLessonIds.has(id),
            ).length;
            return {
              ...access,
              completedLessons,
              totalLessons,
              progressPercent: totalLessons
                ? (completedLessons / totalLessons) * 100
                : 0,
            };
          },
        ),
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
      const rawStructure = await this.course.structure(enrollment, context);
      if (!this.matchesVersion(enrollment, rawStructure)) {
        missingVersion = true;
        continue;
      }
      const structure = await this.applyMigrations(enrollment, rawStructure);
      const items = this.orderedItems(structure);
      const index = items.findIndex(({ item }) => item.id === itemId);
      if (index === -1) continue;
      if (body.contentVersion !== enrollment.contentVersion) {
        throw apiError(
          'CONTENT_VERSION_MISMATCH',
          'Use the enrolled contentVersion',
        );
      }
      const { item } = items[index];
      if (item.type === 'QUIZ')
        throw apiError('FORBIDDEN', 'Quiz completion requires a graded result');

      const evidence = await this.requireItemAccess(
        enrollment,
        structure,
        items,
        index,
      );

      const result = await this.completions.complete(
        enrollment.enrollmentId,
        enrollment.contentVersion,
        itemId,
        {
          courseId: enrollment.courseId,
          migrationCount: evidence.migrationCount,
        },
      );
      return {
        learningItemId: itemId,
        contentVersion: enrollment.contentVersion,
        status: 'COMPLETED',
        completedAt: result.completedAt.toISOString(),
        invalidatedAt: result.invalidatedAt?.toISOString() ?? null,
        invalidationReason: result.invalidationReason ?? null,
      };
    }
    if (missingVersion)
      throw apiError(
        'CONTENT_VERSION_MISMATCH',
        'An enrolled content version is unavailable',
      );
    throw apiError('NOT_FOUND', 'Item not found in an enrolled course');
  }

  async getResume(
    courseId: string,
    context: CourseRequestContext,
  ): Promise<LearningResumeData | null> {
    const enrollment = await this.findCourseEnrollment(courseId, context);
    const checkpoint = await this.resumes.find(
      enrollment.enrollmentId,
      enrollment.contentVersion,
    );
    if (!checkpoint) return null;

    const structure = await this.getStructure(enrollment, context);
    const migration = itemMigration(
      structure.migrations ?? [],
      checkpoint.learningItemId,
      enrollment.contentVersion,
      'REQUIRE_RECOMPLETION',
    );
    if (migration && (checkpoint.migrationCount ?? 0) < migration.generation) {
      const { item } = this.orderedItems(structure).find(
        ({ item }) => item.id === checkpoint.learningItemId,
      )!;
      checkpoint.positionSeconds = item.type === 'VIDEO' ? 0 : null;
    }
    await this.validateResumePosition(
      enrollment,
      checkpoint,
      context,
      structure,
    );
    return this.resumeData(enrollment, checkpoint);
  }

  async saveResume(
    courseId: string,
    body: SaveResumeRequest,
    context: CourseRequestContext,
  ): Promise<LearningResumeData> {
    const enrollment = await this.findCourseEnrollment(courseId, context);
    if (body.contentVersion !== enrollment.contentVersion)
      throw apiError(
        'CONTENT_VERSION_MISMATCH',
        'Use the enrolled contentVersion',
      );

    const structure = await this.validateResumePosition(
      enrollment,
      body,
      context,
    );
    const checkpoint = await this.resumes.save(enrollment.enrollmentId, body, {
      courseId: enrollment.courseId,
      migrationCount: structure.migrations?.length ?? 0,
    });
    if (!checkpoint)
      throw apiError('REVISION_CONFLICT', 'Reload the latest checkpoint');
    return this.resumeData(enrollment, checkpoint);
  }

  private async findCourseEnrollment(
    courseId: string,
    context: CourseRequestContext,
  ) {
    for await (const enrollment of this.course.enrollments(context)) {
      if (enrollment.courseId.toLowerCase() === courseId.toLowerCase())
        return enrollment;
    }
    throw apiError('ENROLLMENT_REQUIRED', 'Course access is required');
  }

  private async validateResumePosition(
    enrollment: EnrollmentSnapshotData,
    {
      lessonId,
      learningItemId,
      positionSeconds,
    }: Pick<
      SaveResumeRequest,
      'lessonId' | 'learningItemId' | 'positionSeconds'
    >,
    context: CourseRequestContext,
    loadedStructure?: LearningStructure,
  ) {
    const structure =
      loadedStructure ?? (await this.getStructure(enrollment, context));
    const items = this.orderedItems(structure);
    const index = items.findIndex(
      ({ lessonId: parentId, item }) =>
        parentId.toLowerCase() === lessonId.toLowerCase() &&
        item.lessonId.toLowerCase() === parentId.toLowerCase() &&
        item.id.toLowerCase() === learningItemId.toLowerCase() &&
        item.courseId.toLowerCase() === enrollment.courseId.toLowerCase() &&
        item.contentVersion === enrollment.contentVersion,
    );
    if (index === -1)
      throw apiError(
        'INVALID_LESSON_RELATION',
        'Item does not belong to the lesson',
      );

    await this.requireItemAccess(enrollment, structure, items, index);
    const { item } = items[index];
    const validPosition =
      item.type === 'VIDEO'
        ? positionSeconds !== null &&
          positionSeconds >= 0 &&
          positionSeconds <= item.durationSeconds
        : positionSeconds === null;
    if (!validPosition)
      throw apiError('VALIDATION_ERROR', 'Position is invalid for the item');
    return structure;
  }

  private resumeData(
    { userId, courseId, contentVersion }: EnrollmentSnapshotData,
    {
      lessonId,
      learningItemId,
      positionSeconds,
      updatedAt,
      revision,
    }: Omit<
      LearningResumeData,
      'userId' | 'courseId' | 'contentVersion' | 'updatedAt'
    > & { updatedAt: Date },
  ): LearningResumeData {
    return {
      userId,
      courseId,
      contentVersion,
      lessonId,
      learningItemId,
      positionSeconds,
      updatedAt: updatedAt.toISOString(),
      revision,
    };
  }

  private orderedItems(structure: CourseLearningStructure) {
    return this.orderedLessons(structure).flatMap(({ lesson, chapterId }) =>
      lesson.items
        .toSorted((a, b) => a.order - b.order)
        .map((item) => ({ item, chapterId, lessonId: lesson.id })),
    );
  }

  private nextStep(
    structure: CourseLearningStructure,
    evidence: ProgressEvidence,
    completedLessons: Set<string>,
    checkpoint: LearningResume | null,
  ): LearningNextStep | null {
    const { completionPolicy } = structure;
    const chapters = this.chapterAccess(structure, evidence);
    const items = this.orderedItems(structure);
    const requiredIds = requiredLessonItemIds(completionPolicy);
    const { completedItems, passedAt } = evidence;
    const itemStep = (
      lessonId: string,
      learningItemId: string,
      positionSeconds: number | null = null,
    ): LearningNextStep => ({
      kind: 'LEARNING_ITEM',
      lessonId,
      learningItemId,
      positionSeconds,
    });

    if (checkpoint) {
      const index = items.findIndex(
        ({ lessonId, item }) =>
          lessonId === checkpoint.lessonId &&
          item.id === checkpoint.learningItemId,
      );
      if (
        index !== -1 &&
        !completedItems.has(checkpoint.learningItemId) &&
        this.canAccessItem(structure, evidence, items, index, chapters) &&
        (checkpoint.migrationCount ?? 0) >=
          (evidence.invalidatedGenerations.get(checkpoint.learningItemId) ?? 0)
      ) {
        return itemStep(
          checkpoint.lessonId,
          checkpoint.learningItemId,
          checkpoint.positionSeconds,
        );
      }
    }

    for (const chapter of chapters) {
      if (chapter.status === 'LOCKED') break;
      for (const lesson of chapter.lessons.toSorted(
        (a, b) => a.order - b.order,
      )) {
        const required = lesson.items.filter(({ id }) => requiredIds.has(id));
        const pending = required
          .toSorted((a, b) => a.order - b.order)
          .find(({ id }) => !completedItems.has(id));
        if (pending) return itemStep(lesson.id, pending.id);
        if (required.length && !completedLessons.has(lesson.id))
          return { kind: 'COMPLETE_LESSON', lessonId: lesson.id };
      }
      const policy = completionPolicy.chapterPolicies.find(
        ({ chapterId }) => chapterId === chapter.chapterId,
      );
      const assessment = policy?.requiredAssessments.find(
        (row) => !passedAt(row),
      );
      if (assessment)
        return {
          kind: 'QUIZ',
          quizId: assessment.quizId,
          assessmentVersion: assessment.assessmentVersion,
        };
    }

    const assessment = completionPolicy.requiredAssessments.find(
      (row) => !passedAt(row),
    );
    return assessment
      ? {
          kind: 'QUIZ',
          quizId: assessment.quizId,
          assessmentVersion: assessment.assessmentVersion,
        }
      : null;
  }

  private async requireItemAccess(
    enrollment: EnrollmentSnapshotData,
    structure: CourseLearningStructure,
    items: ReturnType<ProgressService['orderedItems']>,
    index: number,
  ) {
    const evidence = await this.getEvidence(enrollment, structure);
    if (!this.canAccessItem(structure, evidence, items, index))
      throw apiError(
        'PREREQUISITE_NOT_COMPLETED',
        'Complete the previous requirements first',
      );
    return evidence;
  }

  private canAccessItem(
    structure: CourseLearningStructure,
    evidence: ProgressEvidence,
    items: ReturnType<ProgressService['orderedItems']>,
    index: number,
    chapters = this.chapterAccess(structure, evidence),
  ): boolean {
    const { chapterId } = items[index];
    if (
      chapters.some(
        (chapter) =>
          chapter.chapterId === chapterId && chapter.status === 'LOCKED',
      )
    )
      return false;
    if (structure.completionPolicy.sequence !== 'SEQUENTIAL') return true;
    const requiredIds = requiredLessonItemIds(structure.completionPolicy);
    return items
      .slice(0, index)
      .every(
        ({ item }) =>
          !requiredIds.has(item.id) || evidence.completedItems.has(item.id),
      );
  }

  private orderedLessons({ outline }: CourseLearningStructure) {
    return outline.chapters
      .toSorted((a, b) => a.order - b.order)
      .flatMap(({ id: chapterId, lessons }) =>
        lessons
          .toSorted((a, b) => a.order - b.order)
          .map((lesson) => ({ lesson, chapterId })),
      );
  }

  private async findLesson(lessonId: string, context: CourseRequestContext) {
    let enrolled = false;
    for await (const enrollment of this.course.enrollments(context)) {
      enrolled = true;
      const rawStructure = await this.course.structure(enrollment, context);
      const structure = await this.applyMigrations(enrollment, rawStructure);
      const lessons = this.orderedLessons(structure);
      const index = lessons.findIndex(
        ({ lesson }) => lesson.id.toLowerCase() === lessonId.toLowerCase(),
      );
      if (index === -1) continue;
      if (!this.matchesVersion(enrollment, structure)) {
        throw apiError(
          'CONTENT_VERSION_MISMATCH',
          'The enrolled course version is unavailable',
        );
      }
      return {
        enrollment,
        structure,
        ...lessons[index],
        earlierLessons: lessons.slice(0, index),
      };
    }
    if (!enrolled)
      throw apiError('ENROLLMENT_REQUIRED', 'Course access is required');
    throw apiError('NOT_FOUND', 'Lesson not found in an enrolled course');
  }

  private lessonProgress(
    enrollment: EnrollmentSnapshotData,
    lesson: LessonOutline,
    evidence: ProgressEvidence,
    completedAt?: Date,
    migrationCount = 0,
  ): LessonProgressData {
    const { userId, courseId, contentVersion } = enrollment;
    const items = lesson.items
      .toSorted((a, b) => a.order - b.order)
      .map(({ id }): ItemProgressData => {
        return evidence.itemStates.get(id)!;
      });
    const validCompletion = lessonCompletionValid(
      lesson,
      completedAt,
      evidence,
      migrationCount,
    );
    const invalidated = items.filter(({ learningItemId }) =>
      evidence.requiredItemIds.has(learningItemId),
    );
    const invalidatedStatus = invalidated.some(
      ({ status }) => status === 'RESET',
    )
      ? 'RESET'
      : invalidated.some(({ status }) => status === 'OUTDATED') ||
          (completedAt &&
            !validCompletion &&
            lessonInvalidatedAt(lesson, evidence))
        ? 'OUTDATED'
        : null;
    return {
      userId,
      courseId,
      lessonId: lesson.id,
      contentVersion,
      status:
        invalidatedStatus ??
        (validCompletion
          ? 'COMPLETED'
          : items.some(({ status }) => status === 'COMPLETED')
            ? 'IN_PROGRESS'
            : 'NOT_STARTED'),
      completedAt: completedAt?.toISOString() ?? null,
      items,
    };
  }

  private chapterAccess(
    { outline, completionPolicy }: CourseLearningStructure,
    { completedItems, passedAt }: ProgressEvidence,
  ): Array<
    Pick<
      ChapterAccessData,
      'chapterId' | 'order' | 'contentVersion' | 'status' | 'reason'
    > & {
      lessons: LessonOutline[];
    }
  > {
    const policies = new Map(
      completionPolicy.chapterPolicies.map((policy) => [
        policy.chapterId,
        policy,
      ]),
    );
    let unlocked = true;
    return outline.chapters
      .toSorted((a, b) => a.order - b.order)
      .map(({ id, order, lessons }) => {
        const chapter = {
          chapterId: id,
          order,
          contentVersion: outline.contentVersion,
          lessons,
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
    structure: LearningStructure,
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
  ): Promise<LearningStructure> {
    const structure = await this.course.structure(enrollment, context);
    if (!this.matchesVersion(enrollment, structure)) {
      throw apiError(
        'CONTENT_VERSION_MISMATCH',
        'The enrolled course version is unavailable',
      );
    }
    return this.applyMigrations(enrollment, structure);
  }

  private async applyMigrations(
    enrollment: EnrollmentSnapshotData,
    structure: CourseLearningStructure,
  ) {
    return applyItemMigrations(
      structure,
      enrollment,
      await this.migrations.list(enrollment.courseId),
    );
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
