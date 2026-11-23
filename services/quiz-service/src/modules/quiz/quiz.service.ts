import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { parseContract } from '@lms/contracts';
import type { AuthUser, CreateQuizRequest, QuizData } from '@lms/contracts';
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
}
