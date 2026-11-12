import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type {
  AuthUser,
  CourseData,
  CourseReviewData,
  PageData,
  PageQuery,
  ReviewCourseRequest,
  VersionRequest,
} from '@lms/contracts';
import { Repository } from 'typeorm';
import { Course } from '../courses/entities/course.entity';
import { courseData } from '../courses/courses.service';
import { CourseReview } from './entities/course-review.entity';

@Injectable()
export class CourseRevisionsService {
  constructor(
    @InjectRepository(Course)
    private readonly courses: Repository<Course>,
    @InjectRepository(CourseReview)
    private readonly reviews: Repository<CourseReview>,
  ) {}

  async submit(
    id: string,
    dto: VersionRequest,
    user: AuthUser,
  ): Promise<CourseData> {
    this.requireInstructor(user);
    const course = await this.findCourse(id);
    this.assertOwner(course, user);
    this.assertVersion(course, dto.expectedVersion);
    if (!['DRAFT', 'REJECTED'].includes(course.status))
      throw this.invalidTransition(
        'Only draft or rejected courses can be submitted',
      );

    const nextVersion = course.version + 1;
    const result = await this.courses.update(
      { id, instructorId: user.id, version: dto.expectedVersion },
      { status: 'IN_REVIEW', version: nextVersion },
    );
    if (!result.affected)
      throw this.versionConflict(dto.expectedVersion, nextVersion);
    return courseData(await this.courses.findOneByOrFail({ id }));
  }

  async reviewQueue(
    query: PageQuery,
    user: AuthUser,
  ): Promise<PageData<CourseData>> {
    this.requireAdmin(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [rows, total] = await this.courses.findAndCount({
      where: { status: 'IN_REVIEW' },
      order: { updatedAt: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items: rows.map(courseData), page, limit, total };
  }

  async review(
    id: string,
    dto: ReviewCourseRequest,
    user: AuthUser,
  ): Promise<CourseReviewData> {
    this.requireAdmin(user);
    const course = await this.findCourse(id);
    this.assertVersion(course, dto.expectedVersion);
    if (course.status !== 'IN_REVIEW')
      throw this.invalidTransition('Only courses in review can be reviewed');

    const nextVersion = course.version + 1;
    const status = dto.decision === 'APPROVE' ? 'PUBLISHED' : 'REJECTED';
    const result = await this.courses.update(
      { id, version: dto.expectedVersion, status: 'IN_REVIEW' },
      { status, version: nextVersion },
    );
    if (!result.affected)
      throw this.versionConflict(dto.expectedVersion, nextVersion);
    const saved = await this.reviews.save(
      this.reviews.create({
        courseId: id,
        decision: dto.decision,
        status,
        reviewedBy: user.id,
        reviewedAt: new Date(),
        rejectionReason: dto.decision === 'REJECT' ? dto.reason : null,
        version: nextVersion,
      }),
    );
    return reviewData(saved);
  }

  async listReviews(
    id: string,
    query: PageQuery,
    user: AuthUser,
  ): Promise<PageData<CourseReviewData>> {
    const course = await this.findCourse(id);
    if (user.role !== 'ADMIN' && course.instructorId !== user.id)
      throw new ForbiddenException('Course ownership required');
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [rows, total] = await this.reviews.findAndCount({
      where: { courseId: id },
      order: { reviewedAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items: rows.map(reviewData), page, limit, total };
  }

  private async findCourse(id: string): Promise<Course> {
    const course = await this.courses.findOneBy({ id });
    if (!course) throw new NotFoundException('Course not found');
    return course;
  }

  private assertOwner(course: Course, user: AuthUser): void {
    if (course.instructorId !== user.id)
      throw new ForbiddenException('Course ownership required');
  }

  private assertVersion(course: Course, expectedVersion: number): void {
    if (course.version !== expectedVersion)
      throw this.versionConflict(expectedVersion, course.version);
  }

  private requireInstructor(user: AuthUser): void {
    if (user.role !== 'INSTRUCTOR' || user.status !== 'ACTIVE')
      throw new ForbiddenException('Active instructor account required');
  }

  private requireAdmin(user: AuthUser): void {
    if (user.role !== 'ADMIN' || user.status !== 'ACTIVE')
      throw new ForbiddenException('Active admin account required');
  }

  private invalidTransition(message: string): ConflictException {
    return new ConflictException({
      code: 'INVALID_COURSE_TRANSITION',
      message,
      details: {},
    });
  }

  private versionConflict(expectedVersion: number, currentVersion: number) {
    return new ConflictException({
      code: 'VERSION_CONFLICT',
      message: 'Course was changed by another request',
      details: { expectedVersion, currentVersion },
    });
  }
}

export function reviewData(review: CourseReview): CourseReviewData {
  return {
    id: review.id,
    courseId: review.courseId,
    decision: review.decision,
    status: review.status,
    reviewedBy: review.reviewedBy,
    reviewedAt: review.reviewedAt.toISOString(),
    rejectionReason: review.rejectionReason,
    version: review.version,
  };
}
