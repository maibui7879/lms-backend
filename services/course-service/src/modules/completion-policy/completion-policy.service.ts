import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type {
  AuthUser,
  CourseCompletionPolicy,
  ChapterCompletionPolicy,
  UpdateCompletionPolicyRequest,
} from '@lms/contracts';
import { Repository } from 'typeorm';
import { Chapter } from '../chapters/entities/chapter.entity';
import { Course } from '../courses/entities/course.entity';
import { LearningItem } from '../learning-items/entities/learning-item.entity';
import { Lesson } from '../lessons/entities/lesson.entity';
import { CompletionPolicy } from './entities/completion-policy.entity';

@Injectable()
export class CompletionPolicyService {
  constructor(
    @InjectRepository(CompletionPolicy)
    private readonly policies: Repository<CompletionPolicy>,
    @InjectRepository(Course) private readonly courses: Repository<Course>,
    @InjectRepository(Chapter)
    private readonly chapters: Repository<Chapter>,
    @InjectRepository(Lesson)
    private readonly lessons: Repository<Lesson>,
    @InjectRepository(LearningItem)
    private readonly items: Repository<LearningItem>,
  ) {}

  async get(courseId: string, user: AuthUser): Promise<CourseCompletionPolicy> {
    const course = await this.findReadableCourse(courseId, user);
    return this.getForCourse(course);
  }

  async getForInternal(
    courseId: string,
    contentVersion: number,
  ): Promise<CourseCompletionPolicy> {
    const course = await this.courses.findOneBy({ id: courseId });
    if (!course) throw new NotFoundException('Course not found');
    if (course.contentVersion !== contentVersion)
      throw new ConflictException({
        code: 'CONTENT_VERSION_UNAVAILABLE',
        message: 'Requested course content version is not available',
        details: {
          courseId,
          contentVersion,
          currentVersion: course.contentVersion,
        },
      });
    return this.getForCourse(course);
  }

  private async getForCourse(course: Course): Promise<CourseCompletionPolicy> {
    const { id: courseId } = course;
    const policy = await this.policies.findOneBy({ courseId });
    const content = await this.loadContent(courseId);
    if (policy) return this.toContract(course, policy);
    return this.toContract(
      course,
      this.defaultPolicy(
        course,
        content.items,
        content.chapters,
        content.lessons,
      ),
    );
  }

  async update(
    courseId: string,
    dto: UpdateCompletionPolicyRequest,
    user: AuthUser,
  ): Promise<CourseCompletionPolicy> {
    const course = await this.assertEditableCourse(courseId, user);
    if (course.version !== dto.expectedVersion)
      throw this.versionConflict(dto.expectedVersion, course.version);
    const content = await this.loadContent(courseId);
    const requiredItemIds = content.items
      .filter((item) => item.required)
      .map((item) => item.id);
    this.validateAssessments(dto.requiredAssessments, content.items);
    const chapterPolicies = this.buildChapterPolicies(
      dto.chapterPolicies,
      content.chapters,
      content.lessons,
      content.items,
    );
    const nextContentVersion = course.contentVersion + 1;
    const current = await this.policies.findOneBy({ courseId });
    const policy = this.policies.create({
      ...(current ?? {}),
      courseId,
      contentVersion: nextContentVersion,
      requiredItemIds,
      requiredAssessments: dto.requiredAssessments,
      chapterPolicies,
      sequence: dto.sequence,
      assessmentRule: 'ANY_PASSED_ATTEMPT_SAME_VERSION',
      certificateEnabled: dto.certificateEnabled,
    });
    const saved = await this.policies.save(policy);
    const result = await this.courses.update(
      { id: courseId, version: dto.expectedVersion },
      { version: dto.expectedVersion + 1, contentVersion: nextContentVersion },
    );
    if (!result.affected)
      throw this.versionConflict(dto.expectedVersion, dto.expectedVersion + 1);
    return this.toContract(
      { ...course, contentVersion: nextContentVersion },
      saved,
    );
  }

  private validateAssessments(
    assessments: UpdateCompletionPolicyRequest['requiredAssessments'],
    items: LearningItem[],
  ): void {
    const quizItems = new Map(
      items
        .filter((item) => item.type === 'QUIZ' && item.quizId)
        .map((item) => [item.quizId!, item]),
    );
    const seen = new Set<string>();
    for (const assessment of assessments) {
      if (seen.has(assessment.quizId))
        throw this.requirementsConflict(
          'Each required assessment quizId must be unique',
        );
      seen.add(assessment.quizId);
      const item = quizItems.get(assessment.quizId);
      if (!item || item.assessmentVersion !== assessment.assessmentVersion)
        throw this.requirementsConflict(
          'Required assessment must reference a quiz item in this course with the same assessmentVersion',
        );
    }
  }

  private buildChapterPolicies(
    requested: UpdateCompletionPolicyRequest['chapterPolicies'],
    chapters: Chapter[],
    lessons: Lesson[],
    items: LearningItem[],
  ): ChapterCompletionPolicy[] {
    const chapterIds = new Set<string>();
    return requested.map((policy) => {
      if (chapterIds.has(policy.chapterId))
        throw this.requirementsConflict(
          'Each chapter policy must use a unique chapterId',
        );
      chapterIds.add(policy.chapterId);
      const chapter = chapters.find((value) => value.id === policy.chapterId);
      if (!chapter)
        throw this.requirementsConflict(
          'Chapter policy must reference a chapter in this course',
        );
      const lessonIds = new Set(
        lessons
          .filter((lesson) => lesson.chapterId === chapter.id)
          .map((lesson) => lesson.id),
      );
      const chapterItems = items.filter((item) => lessonIds.has(item.lessonId));
      this.validateAssessments(policy.requiredAssessments, chapterItems);
      return {
        chapterId: chapter.id,
        requiredItemIds: chapterItems
          .filter((item) => item.required)
          .map((item) => item.id),
        requiredAssessments: policy.requiredAssessments,
      };
    });
  }

  private async loadContent(courseId: string): Promise<{
    chapters: Chapter[];
    lessons: Lesson[];
    items: LearningItem[];
  }> {
    const [chapters, lessons, items] = await Promise.all([
      this.chapters.find({ where: { courseId }, order: { order: 'ASC' } }),
      this.lessons.find({ where: { courseId }, order: { order: 'ASC' } }),
      this.items.find({ where: { courseId }, order: { order: 'ASC' } }),
    ]);
    return { chapters, lessons, items };
  }

  private defaultPolicy(
    course: Course,
    items: LearningItem[],
    chapters: Chapter[],
    lessons: Lesson[],
  ): CompletionPolicy {
    const chapterPolicies = chapters.map((chapter) => {
      const lessonIds = new Set(
        lessons
          .filter((lesson) => lesson.chapterId === chapter.id)
          .map((lesson) => lesson.id),
      );
      return {
        chapterId: chapter.id,
        requiredItemIds: items
          .filter((item) => lessonIds.has(item.lessonId) && item.required)
          .map((item) => item.id),
        requiredAssessments: [],
      };
    });
    return {
      courseId: course.id,
      contentVersion: course.contentVersion,
      requiredItemIds: items
        .filter((item) => item.required)
        .map((item) => item.id),
      requiredAssessments: [],
      chapterPolicies,
      sequence: 'FREE',
      assessmentRule: 'ANY_PASSED_ATTEMPT_SAME_VERSION',
      certificateEnabled: false,
      updatedAt: new Date(),
    };
  }

  private toContract(
    course: Course,
    policy: CompletionPolicy,
  ): CourseCompletionPolicy {
    return {
      courseId: course.id,
      contentVersion: policy.contentVersion,
      requiredItemIds: policy.requiredItemIds,
      requiredAssessments: policy.requiredAssessments,
      chapterPolicies: policy.chapterPolicies,
      sequence: policy.sequence,
      assessmentRule: policy.assessmentRule,
      certificateEnabled: policy.certificateEnabled,
    };
  }

  private async findReadableCourse(
    courseId: string,
    user: AuthUser,
  ): Promise<Course> {
    const course = await this.courses.findOneBy({ id: courseId });
    if (!course) throw new NotFoundException('Course not found');
    if (
      user.role !== 'ADMIN' &&
      course.instructorId !== user.id &&
      course.status !== 'PUBLISHED'
    )
      throw new ForbiddenException('Enrollment or course ownership required');
    return course;
  }

  private async assertEditableCourse(
    courseId: string,
    user: AuthUser,
  ): Promise<Course> {
    if (user.role !== 'INSTRUCTOR' || user.status !== 'ACTIVE')
      throw new ForbiddenException('Active instructor account required');
    const course = await this.courses.findOneBy({ id: courseId });
    if (!course) throw new NotFoundException('Course not found');
    if (course.instructorId !== user.id)
      throw new ForbiddenException('Course ownership required');
    if (!['DRAFT', 'REJECTED'].includes(course.status))
      throw new ConflictException({
        code: 'INVALID_COURSE_TRANSITION',
        message: 'Published or in-review course cannot be updated directly',
        details: {},
      });
    return course;
  }

  private requirementsConflict(message: string): ConflictException {
    return new ConflictException({
      code: 'INVALID_COURSE_REQUIREMENTS',
      message,
      details: {},
    });
  }
  private versionConflict(
    expectedVersion: number,
    currentVersion: number,
  ): ConflictException {
    return new ConflictException({
      code: 'VERSION_CONFLICT',
      message: 'Course was changed by another request',
      details: { expectedVersion, currentVersion },
    });
  }
}
