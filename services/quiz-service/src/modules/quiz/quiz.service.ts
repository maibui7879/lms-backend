import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { parseContract } from '@lms/contracts';
import type {
  AuthUser,
  CreateQuizRequest,
  QuizData,
  UpdateQuizRequest,
} from '@lms/contracts';
import type { Repository } from 'typeorm';
import type { CourseRequestContext } from '../../integrations/course.client';
import { CourseClient } from '../../integrations/course.client';
import { Quiz } from './entities/quiz.entity';

@Injectable()
export class QuizService {
  constructor(
    @InjectRepository(Quiz)
    private readonly quizzes: Repository<Quiz>,
    private readonly course: CourseClient,
  ) {}

  async create(
    request: CreateQuizRequest,
    user: AuthUser,
    context: CourseRequestContext,
  ): Promise<QuizData> {
    if (user.role !== 'INSTRUCTOR' || user.status !== 'ACTIVE')
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'An active instructor account is required',
        details: {},
      });

    await this.course.requireQuizPlacement(request, context);

    const quiz = await this.quizzes.save(
      this.quizzes.create({
        ...request,
        instructorId: user.id,
        status: 'DRAFT',
        assessmentVersion: 1,
        version: 1,
      }),
    );

    return parseContract('QuizData', {
      id: quiz.id,
      courseId: quiz.courseId,
      chapterId: quiz.chapterId,
      lessonId: quiz.lessonId,
      title: quiz.title,
      policy: quiz.policy,
      placement: quiz.placement,
      instructorId: quiz.instructorId,
      status: quiz.status,
      assessmentVersion: quiz.assessmentVersion,
      version: quiz.version,
    });
  }

  async update(
    id: string,
    change: UpdateQuizRequest,
    user: AuthUser,
    context: CourseRequestContext,
  ): Promise<QuizData> {
    if (user.role !== 'INSTRUCTOR' || user.status !== 'ACTIVE')
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'An active instructor account is required',
        details: {},
      });

    const quiz = await this.quizzes.findOneBy({ id });
    if (!quiz)
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Quiz was not found',
        details: {},
      });
    if (quiz.instructorId !== user.id)
      throw new ForbiddenException({
        code: 'NOT_COURSE_OWNER',
        message: 'Course ownership is required',
        details: {},
      });

    await this.course.requireQuizPlacement(
      {
        courseId: quiz.courseId,
        chapterId: quiz.chapterId,
        lessonId: quiz.lessonId,
        placement: quiz.placement,
        title: quiz.title,
        policy: quiz.policy,
      } as CreateQuizRequest,
      context,
    );

    if (quiz.status !== 'DRAFT')
      throw new ConflictException({
        code: 'INVALID_QUIZ_TRANSITION',
        message: 'Only draft quizzes can be updated',
        details: {},
      });
    if (quiz.version !== change.expectedVersion)
      throw new ConflictException({
        code: 'VERSION_CONFLICT',
        message: 'Quiz version has changed',
        details: {},
      });

    const title = change.title ?? quiz.title;
    const policy = change.policy ?? quiz.policy;
    parseContract('CreateQuizRequest', {
      courseId: quiz.courseId,
      chapterId: quiz.chapterId,
      lessonId: quiz.lessonId,
      placement: quiz.placement,
      title,
      policy,
    });

    const result = await this.quizzes
      .createQueryBuilder()
      .update(Quiz)
      .set({ title, policy, version: quiz.version + 1 })
      .where('id = :id AND status = :status AND version = :version', {
        id,
        status: 'DRAFT',
        version: change.expectedVersion,
      })
      .returning('*')
      .execute();
    if (!result.affected) {
      const current = await this.quizzes.findOneBy({ id });
      throw new ConflictException({
        code:
          current?.status === 'DRAFT'
            ? 'VERSION_CONFLICT'
            : 'INVALID_QUIZ_TRANSITION',
        message: 'Quiz changed while updating',
        details: {},
      });
    }
    const updated = this.quizzes.create(result.raw[0] as Quiz);
    return parseContract('QuizData', {
      id: updated.id,
      courseId: quiz.courseId,
      chapterId: quiz.chapterId,
      lessonId: quiz.lessonId,
      placement: quiz.placement,
      instructorId: quiz.instructorId,
      title,
      policy,
      status: 'DRAFT',
      assessmentVersion: quiz.assessmentVersion,
      version: quiz.version + 1,
    });
  }
}
