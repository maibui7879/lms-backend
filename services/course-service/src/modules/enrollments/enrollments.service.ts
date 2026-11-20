import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type {
  AuthUser,
  EnrollmentCheckData,
  EnrollmentSnapshotData,
  EnrolledCourseData,
  PageData,
  PageQuery,
} from '@lms/contracts';
import { In, QueryFailedError, Repository } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { EnrollmentOutboxService } from '../outbox/enrollment-outbox.service';
import { Course } from '../courses/entities/course.entity';
import { courseData } from '../courses/courses.service';
import { Enrollment } from './entities/enrollment.entity';

@Injectable()
export class EnrollmentsService {
  constructor(
    @InjectRepository(Enrollment)
    private readonly enrollments: Repository<Enrollment>,
    @InjectRepository(Course)
    private readonly courses: Repository<Course>,
    private readonly outbox: EnrollmentOutboxService,
  ) {}

  async create(
    courseId: string,
    user: AuthUser,
    correlationId: string = randomUUID(),
  ): Promise<EnrollmentSnapshotData> {
    this.requireStudent(user);
    try {
      return await this.enrollments.manager.transaction(async (manager) => {
        const enrollments = manager.getRepository(Enrollment);
        const course = await manager
          .getRepository(Course)
          .findOneBy({ id: courseId });
        if (!course) throw new NotFoundException('Course not found');
        if (course.status !== 'PUBLISHED')
          throw new ConflictException({
            code: 'COURSE_NOT_PUBLISHED',
            message: 'Only published courses can be enrolled in',
            details: {},
          });

        const existing = await enrollments.findOneBy({
          courseId,
          userId: user.id,
          status: In(['ACTIVE', 'COMPLETED']),
        });
        if (existing)
          throw new ConflictException({
            code: 'ALREADY_ENROLLED',
            message: 'User is already enrolled in this course',
            details: {},
          });

        const now = new Date();
        const enrollment = await enrollments.save(
          enrollments.create({
            courseId,
            userId: user.id,
            status: 'ACTIVE',
            enrolledAt: now,
            contentVersion: course.contentVersion,
          }),
        );
        const snapshot = enrollmentData(enrollment);
        await this.outbox.created(manager, snapshot, correlationId);
        return snapshot;
      });
    } catch (error) {
      // The partial unique index also closes the concurrent-create race.
      if (error instanceof QueryFailedError) {
        const failure = error.driverError as {
          code?: string;
          constraint?: string;
        };
        if (
          failure.code === '23505' &&
          failure.constraint === 'IDX_enrollments_current_pair'
        )
          throw new ConflictException({
            code: 'ALREADY_ENROLLED',
            message: 'User is already enrolled in this course',
            details: {},
          });
      }
      throw error;
    }
  }

  async listMine(
    user: AuthUser,
    query: PageQuery,
  ): Promise<PageData<EnrolledCourseData>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [rows, total] = await this.enrollments.findAndCount({
      where: { userId: user.id, status: In(['ACTIVE', 'COMPLETED']) },
      order: { enrolledAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    const courses = rows.length
      ? await this.courses.findBy({ id: In(rows.map((row) => row.courseId)) })
      : [];
    const byId = new Map(courses.map((course) => [course.id, course]));
    return {
      items: rows.flatMap((enrollment) => {
        const course = byId.get(enrollment.courseId);
        return course
          ? [
              {
                enrollment: enrollmentData(enrollment),
                course: courseData(course),
              },
            ]
          : [];
      }),
      page,
      limit,
      total,
    };
  }

  async cancel(
    id: string,
    user: AuthUser,
    correlationId: string = randomUUID(),
  ): Promise<void> {
    await this.enrollments.manager.transaction(async (manager) => {
      const enrollments = manager.getRepository(Enrollment);
      const enrollment = await enrollments.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!enrollment) throw new NotFoundException('Enrollment not found');
      if (enrollment.userId !== user.id)
        throw new ForbiddenException('Enrollment ownership required');
      if (enrollment.status === 'COMPLETED')
        throw new ConflictException({
          code: 'INVALID_ENROLLMENT_TRANSITION',
          message: 'Completed enrollment cannot be cancelled',
          details: {},
        });
      if (enrollment.status === 'ACTIVE') {
        await enrollments.update(
          { id, userId: user.id },
          { status: 'CANCELLED' },
        );
        await this.outbox.cancelled(
          manager,
          {
            enrollmentId: enrollment.id,
            courseId: enrollment.courseId,
            userId: enrollment.userId,
            cancelledAt: new Date().toISOString(),
          },
          correlationId,
        );
      }
    });
  }

  async check(userId: string, courseId: string): Promise<EnrollmentCheckData> {
    const enrollment = await this.enrollments.findOneBy({
      userId,
      courseId,
      status: In(['ACTIVE', 'COMPLETED']),
    });
    return enrollment
      ? {
          enrolled: true,
          enrollmentId: enrollment.id,
          status: enrollment.status,
        }
      : { enrolled: false };
  }

  private requireStudent(user: AuthUser): void {
    if (user.role !== 'STUDENT' || user.status !== 'ACTIVE')
      throw new ForbiddenException('Active student account required');
  }
}

export function enrollmentData(enrollment: Enrollment): EnrollmentSnapshotData {
  return {
    enrollmentId: enrollment.id,
    courseId: enrollment.courseId,
    userId: enrollment.userId,
    status: enrollment.status,
    enrolledAt: enrollment.enrolledAt.toISOString(),
    contentVersion: enrollment.contentVersion,
  };
}
