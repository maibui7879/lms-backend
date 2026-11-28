import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { parseContract } from '@lms/contracts';
import type {
  AuthUser,
  CreateQuizRequest,
  QuizData,
  UpdateQuizRequest,
  VersionRequest,
} from '@lms/contracts';
import type { Repository } from 'typeorm';
import { QuizAttempt } from '../quiz-attempt/entities/quiz-attempt.entity';
import { QuizQuestion } from '../quiz-question/entities/quiz-question.entity';
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

  async publish(
    id: string,
    body: VersionRequest,
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
        message: 'Only draft quizzes can be published',
        details: {},
      });
    if (quiz.version !== body.expectedVersion)
      throw new ConflictException({
        code: 'VERSION_CONFLICT',
        message: 'Quiz version has changed',
        details: {},
      });

    const validPolicy = parseContract('QuizPolicy', quiz.policy);
    if (
      validPolicy.quizType === 'PRACTICE' &&
      validPolicy.requiredForCompletion
    )
      throw new UnprocessableEntityException({
        code: 'INVALID_QUIZ_POLICY',
        message: 'Practice quiz cannot be required for completion',
        details: {},
      });
    await this.course.requirePublishReference(
      {
        ...({
          courseId: quiz.courseId,
          chapterId: quiz.chapterId,
          lessonId: quiz.lessonId,
          placement: quiz.placement,
          title: quiz.title,
          policy: quiz.policy,
        } as CreateQuizRequest),
        id,
        assessmentVersion: quiz.assessmentVersion,
      },
      context,
    );

    const published = await this.quizzes.manager.transaction(
      async (manager) => {
        const lockedQuiz = await manager
          .getRepository(Quiz)
          .findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
        if (!lockedQuiz || lockedQuiz.status !== 'DRAFT')
          throw new ConflictException({
            code: 'INVALID_QUIZ_TRANSITION',
            message: 'Quiz is no longer a draft',
            details: {},
          });
        if (lockedQuiz.version !== body.expectedVersion)
          throw new ConflictException({
            code: 'VERSION_CONFLICT',
            message: 'Quiz version has changed',
            details: {},
          });
        const questions = await manager
          .getRepository(QuizQuestion)
          .findBy({ quizId: id });
        const total = questions.reduce(
          (sum, question) => sum + Number(question.points),
          0,
        );
        if (!questions.length || !Number.isFinite(total) || total <= 0)
          throw new UnprocessableEntityException({
            code: 'INVALID_QUIZ_POLICY',
            message: 'Quiz needs questions with positive total points',
            details: {},
          });
        for (const question of questions) {
          const choiceIds = question.choices.map((choice) =>
            choice.id.toLowerCase(),
          );
          const correctIds = question.correctChoiceIds.map((choiceId) =>
            choiceId.toLowerCase(),
          );
          if (
            question.choices.length < 2 ||
            new Set(choiceIds).size !== choiceIds.length ||
            !correctIds.length ||
            new Set(correctIds).size !== correctIds.length ||
            correctIds.some((choiceId) => !choiceIds.includes(choiceId)) ||
            (question.type === 'SINGLE_CHOICE' && correctIds.length !== 1) ||
            !Number.isFinite(Number(question.points)) ||
            Number(question.points) <= 0
          )
            throw new UnprocessableEntityException({
              code: 'INVALID_QUIZ_POLICY',
              message: 'Quiz contains an invalid question',
              details: {},
            });
        }
        lockedQuiz.status = 'PUBLISHED';
        lockedQuiz.version += 1;
        return manager.getRepository(Quiz).save(lockedQuiz);
      },
    );
    return parseContract('QuizData', {
      id: published.id,
      courseId: published.courseId,
      chapterId: published.chapterId,
      lessonId: published.lessonId,
      placement: published.placement,
      title: published.title,
      policy: published.policy,
      instructorId: published.instructorId,
      status: published.status,
      assessmentVersion: published.assessmentVersion,
      version: published.version,
    });
  }

  async remove(
    id: string,
    body: VersionRequest,
    user: AuthUser,
    context: CourseRequestContext,
  ): Promise<void> {
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
        message: 'Only draft quizzes can be deleted',
        details: {},
      });
    if (quiz.version !== body.expectedVersion)
      throw new ConflictException({
        code: 'VERSION_CONFLICT',
        message: 'Quiz version has changed',
        details: {},
      });
    if (await this.course.hasQuizReference(id, quiz.courseId, context))
      throw new ConflictException({
        code: 'CONTENT_NOT_EMPTY',
        message: 'Quiz is still referenced by Course',
        details: {},
      });

    await this.quizzes.manager.transaction(async (manager) => {
      const lockedQuiz = await manager
        .getRepository(Quiz)
        .findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!lockedQuiz || lockedQuiz.status !== 'DRAFT')
        throw new ConflictException({
          code: 'INVALID_QUIZ_TRANSITION',
          message: 'Quiz is no longer a draft',
          details: {},
        });
      if (lockedQuiz.version !== body.expectedVersion)
        throw new ConflictException({
          code: 'VERSION_CONFLICT',
          message: 'Quiz version has changed',
          details: {},
        });
      if (await manager.getRepository(QuizAttempt).existsBy({ quizId: id }))
        throw new ConflictException({
          code: 'CONTENT_NOT_EMPTY',
          message: 'Quiz has attempt history',
          details: {},
        });
      await manager.getRepository(QuizQuestion).delete({ quizId: id });
      const result = await manager
        .getRepository(Quiz)
        .delete({ id, status: 'DRAFT', version: body.expectedVersion });
      if (result.affected !== 1)
        throw new ConflictException({
          code: 'VERSION_CONFLICT',
          message: 'Quiz changed while deleting',
          details: {},
        });
    });
  }

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
