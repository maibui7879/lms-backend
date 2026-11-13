import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type {
  CourseAccessData,
  CourseAccessQuery,
  CourseContentReference,
  CourseLearningStructure,
  ContentVersionQuery,
} from '@lms/contracts';
import { In, Repository } from 'typeorm';
import { Chapter } from '../chapters/entities/chapter.entity';
import { chapterData } from '../chapters/chapters.service';
import { CompletionPolicyService } from '../completion-policy/completion-policy.service';
import { Course } from '../courses/entities/course.entity';
import { Enrollment } from '../enrollments/entities/enrollment.entity';
import { LearningItem } from '../learning-items/entities/learning-item.entity';
import { learningItemData } from '../learning-items/learning-items.service';
import { Lesson } from '../lessons/entities/lesson.entity';
import { lessonData } from '../lessons/lessons.service';

@Injectable()
export class InternalService {
  constructor(
    @InjectRepository(Course)
    private readonly courses: Repository<Course>,
    @InjectRepository(Chapter)
    private readonly chapters: Repository<Chapter>,
    @InjectRepository(Lesson)
    private readonly lessons: Repository<Lesson>,
    @InjectRepository(LearningItem)
    private readonly items: Repository<LearningItem>,
    @InjectRepository(Enrollment)
    private readonly enrollments: Repository<Enrollment>,
    private readonly completionPolicies: CompletionPolicyService,
  ) {}

  async checkCourseAccess(query: CourseAccessQuery): Promise<CourseAccessData> {
    const course = await this.courses.findOneBy({ id: query.courseId });
    if (!course) throw new NotFoundException('Course not found');
    if (course.status !== 'PUBLISHED')
      return { allowed: false, reason: 'COURSE_NOT_PUBLISHED' };

    if (query.learningItemId) {
      const item = await this.items.findOneBy({
        id: query.learningItemId,
        courseId: query.courseId,
      });
      if (!item) throw new NotFoundException('Learning item not found');
    }

    const enrollment = await this.enrollments.findOne({
      where: {
        userId: query.userId,
        courseId: query.courseId,
        status: In(['ACTIVE', 'COMPLETED']),
      },
    });
    if (!enrollment) return { allowed: false, reason: 'ENROLLMENT_REQUIRED' };
    return {
      allowed: true,
      enrollmentId: enrollment.id,
      contentVersion: enrollment.contentVersion,
    };
  }

  async getContentReference(quizId: string): Promise<CourseContentReference> {
    const item = await this.items.findOneBy({ type: 'QUIZ', quizId });
    if (!item) throw new NotFoundException('Quiz content reference not found');
    const course = await this.courses.findOneBy({ id: item.courseId });
    if (!course) throw new NotFoundException('Course not found');
    return {
      courseId: course.id,
      lessonId: item.lessonId,
      learningItemId: item.id,
      quizId,
      instructorId: course.instructorId,
      contentVersion: item.contentVersion,
      assessmentVersion: item.assessmentVersion!,
      published: course.status === 'PUBLISHED',
      requiredForCompletion: item.required,
    };
  }

  async getLearningStructure(
    courseId: string,
    query: ContentVersionQuery,
  ): Promise<CourseLearningStructure> {
    const course = await this.courses.findOneBy({ id: courseId });
    if (!course) throw new NotFoundException('Course not found');
    if (course.contentVersion !== query.contentVersion)
      throw new ConflictException({
        code: 'CONTENT_VERSION_UNAVAILABLE',
        message: 'Requested course content version is not available',
        details: {
          courseId,
          contentVersion: query.contentVersion,
          currentVersion: course.contentVersion,
        },
      });

    const [chapters, lessons, items] = await Promise.all([
      this.chapters.find({ where: { courseId }, order: { order: 'ASC' } }),
      this.lessons.find({ where: { courseId }, order: { order: 'ASC' } }),
      this.items.find({ where: { courseId }, order: { order: 'ASC' } }),
    ]);
    return {
      outline: {
        courseId,
        revisionId: courseId,
        contentVersion: query.contentVersion,
        chapters: chapters.map((chapter) => ({
          ...chapterData(chapter),
          lessons: lessons
            .filter((lesson) => lesson.chapterId === chapter.id)
            .map((lesson) => ({
              ...lessonData(lesson),
              items: items
                .filter((item) => item.lessonId === lesson.id)
                .map(learningItemData),
            })),
        })),
      },
      completionPolicy: await this.completionPolicies.getForInternal(
        courseId,
        query.contentVersion,
      ),
    };
  }
}
