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
  EnrollmentData,
  EnrollmentSnapshotData,
  EnrolledCourseData,
  PageData,
  PageQuery,
} from '@lms/contracts';
import { In, Repository } from 'typeorm';
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
  ) {}

  async create(
    courseId: string,
    user: AuthUser,
  ): Promise<EnrollmentSnapshotData> {
    this.requireStudent(user);
    const course = await this.courses.findOneBy({ id: courseId });
    if (!course) throw new NotFoundException('Course not found');
    if (course.status !== 'PUBLISHED')
      throw new ConflictException({
        code: 'COURSE_NOT_PUBLISHED',
        message: 'Only published courses can be enrolled in',
        details: {},
      });

    const existing = await this.enrollments.findOneBy({
      courseId,
      userId: user.id,
    });
    if (existing && existing.status !== 'CANCELLED')
      throw new ConflictException({
        code: 'ALREADY_ENROLLED',
        message: 'User is already enrolled in this course',
        details: {},
      });

    const now = new Date();
    const enrollment = existing
      ? await this.enrollments.save({
          ...existing,
          status: 'ACTIVE',
          enrolledAt: now,
          contentVersion: course.contentVersion,
        })
      : await this.enrollments.save(
          this.enrollments.create({
            courseId,
            userId: user.id,
            status: 'ACTIVE',
            enrolledAt: now,
            contentVersion: course.contentVersion,
          }),
        );
    return enrollmentData(enrollment);
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

  async cancel(id: string, user: AuthUser): Promise<void> {
    const enrollment = await this.enrollments.findOneBy({ id });
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
      await this.enrollments.update(
        { id, userId: user.id },
        { status: 'CANCELLED' },
      );
    }
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
