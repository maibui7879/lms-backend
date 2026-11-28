import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { parseContract } from '@lms/contracts';
import type {
  AuthUser,
  CreateQuestionRequest,
  CreateQuizRequest,
  PageData,
  PageQuery,
  QuestionAuthoringDTO,
  UpdateQuestionRequest,
  VersionRequest,
} from '@lms/contracts';
import type { Repository } from 'typeorm';
import {
  CourseClient,
  type CourseRequestContext,
} from '../../integrations/course.client';
import { Quiz } from '../quiz/entities/quiz.entity';
import { QuizQuestion } from './entities/quiz-question.entity';

@Injectable()
export class QuizQuestionService {
  constructor(
    @InjectRepository(Quiz) private readonly quizzes: Repository<Quiz>,
    @InjectRepository(QuizQuestion)
    private readonly questions: Repository<QuizQuestion>,
    private readonly course: CourseClient,
  ) {}

  async list(
    id: string,
    query: PageQuery,
    user: AuthUser,
    context: CourseRequestContext,
  ): Promise<PageData<QuestionAuthoringDTO>> {
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

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [rows, total] = await this.questions.findAndCount({
      where: { quizId: id },
      order: { sortOrder: 'ASC', id: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return {
      items: rows.map((row) =>
        parseContract('QuestionAuthoringDTO', {
          id: row.id,
          type: row.type,
          prompt: row.prompt,
          choices: row.choices,
          points: Number(row.points),
          correctChoiceIds: row.correctChoiceIds,
          skillIds: row.skillIds,
          explanation: row.explanation,
          version: row.version,
        }),
      ),
      page,
      limit,
      total,
    };
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
    const question = await this.questions.findOneBy({ id });
    if (!question)
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Question was not found',
        details: {},
      });
    const quiz = await this.quizzes.findOneBy({ id: question.quizId });
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
        message: 'Only draft questions can be deleted',
        details: {},
      });
    if (question.version !== body.expectedVersion)
      throw new ConflictException({
        code: 'VERSION_CONFLICT',
        message: 'Question version has changed',
        details: {},
      });

    await this.questions.manager.transaction(async (manager) => {
      const lockedQuiz = await manager.getRepository(Quiz).findOne({
        where: { id: quiz.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!lockedQuiz || lockedQuiz.status !== 'DRAFT')
        throw new ConflictException({
          code: 'INVALID_QUIZ_TRANSITION',
          message: 'Quiz is no longer a draft',
          details: {},
        });
      const result = await manager.getRepository(QuizQuestion).delete({
        id,
        quizId: quiz.id,
        version: body.expectedVersion,
      });
      if (result.affected !== 1)
        throw new ConflictException({
          code: 'VERSION_CONFLICT',
          message: 'Question version has changed',
          details: {},
        });
    });
  }

  async update(
    id: string,
    body: UpdateQuestionRequest,
    user: AuthUser,
    context: CourseRequestContext,
  ): Promise<QuestionAuthoringDTO> {
    if (user.role !== 'INSTRUCTOR' || user.status !== 'ACTIVE')
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'An active instructor account is required',
        details: {},
      });
    const question = await this.questions.findOneBy({ id });
    if (!question)
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Question was not found',
        details: {},
      });
    const quiz = await this.quizzes.findOneBy({ id: question.quizId });
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
        message: 'Only draft questions can be updated',
        details: {},
      });
    if (question.version !== body.expectedVersion)
      throw new ConflictException({
        code: 'VERSION_CONFLICT',
        message: 'Question version has changed',
        details: {},
      });

    const choiceIds = body.choices.map((choice) => choice.id.toLowerCase());
    const correctIds = body.correctChoiceIds.map((choiceId) =>
      choiceId.toLowerCase(),
    );
    if (
      new Set(choiceIds).size !== choiceIds.length ||
      correctIds.some((choiceId) => !choiceIds.includes(choiceId)) ||
      (body.type === 'SINGLE_CHOICE' && correctIds.length !== 1)
    )
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Invalid choice IDs or correct answers',
        details: {},
      });

    const updated = await this.questions.manager.transaction(
      async (manager) => {
        const lockedQuiz = await manager.getRepository(Quiz).findOne({
          where: { id: quiz.id },
          lock: { mode: 'pessimistic_write' },
        });
        if (!lockedQuiz || lockedQuiz.status !== 'DRAFT')
          throw new ConflictException({
            code: 'INVALID_QUIZ_TRANSITION',
            message: 'Quiz is no longer a draft',
            details: {},
          });
        const repository = manager.getRepository(QuizQuestion);
        const result = await repository.update(
          { id, quizId: quiz.id, version: body.expectedVersion },
          {
            type: body.type,
            prompt: body.prompt,
            choices: body.choices,
            points: String(body.points),
            correctChoiceIds: body.correctChoiceIds,
            skillIds: body.skillIds,
            explanation: body.explanation,
            version: body.expectedVersion + 1,
          },
        );
        if (result.affected !== 1)
          throw new ConflictException({
            code: 'VERSION_CONFLICT',
            message: 'Question version has changed',
            details: {},
          });
        return repository.findOneByOrFail({ id });
      },
    );
    return parseContract('QuestionAuthoringDTO', {
      id: updated.id,
      type: updated.type,
      prompt: updated.prompt,
      choices: updated.choices,
      points: Number(updated.points),
      correctChoiceIds: updated.correctChoiceIds,
      skillIds: updated.skillIds,
      explanation: updated.explanation,
      version: updated.version,
    });
  }

  async create(
    id: string,
    body: CreateQuestionRequest,
    user: AuthUser,
    context: CourseRequestContext,
  ): Promise<QuestionAuthoringDTO> {
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
        message: 'Only draft quizzes can receive questions',
        details: {},
      });

    const choiceIds = body.choices.map((choice) => choice.id.toLowerCase());
    const correctIds = body.correctChoiceIds.map((choiceId) =>
      choiceId.toLowerCase(),
    );
    if (
      new Set(choiceIds).size !== choiceIds.length ||
      correctIds.some((choiceId) => !choiceIds.includes(choiceId)) ||
      (body.type === 'SINGLE_CHOICE' && correctIds.length !== 1)
    )
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Invalid choice IDs or correct answers',
        details: {},
      });

    const result = await this.questions.manager.transaction(async (manager) => {
      const lockedQuiz = await manager
        .getRepository(Quiz)
        .findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!lockedQuiz || lockedQuiz.status !== 'DRAFT')
        throw new ConflictException({
          code: 'INVALID_QUIZ_TRANSITION',
          message: 'Quiz is no longer a draft',
          details: {},
        });
      const repository = manager.getRepository(QuizQuestion);
      const count = await repository.countBy({ quizId: id });
      return repository.save(
        repository.create({
          quizId: id,
          type: body.type,
          prompt: body.prompt,
          choices: body.choices,
          points: String(body.points),
          correctChoiceIds: body.correctChoiceIds,
          skillIds: body.skillIds,
          explanation: body.explanation,
          sortOrder: count,
          version: 1,
        }),
      );
    });
    return parseContract('QuestionAuthoringDTO', {
      id: result.id,
      type: result.type,
      prompt: result.prompt,
      choices: result.choices,
      points: Number(result.points),
      correctChoiceIds: result.correctChoiceIds,
      skillIds: result.skillIds,
      explanation: result.explanation,
      version: result.version,
    });
  }
}
