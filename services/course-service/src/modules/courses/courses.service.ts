import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, In, Repository } from 'typeorm';
import type {
  AuthUser,
  CourseData,
  CourseLearnerData,
  CourseOutlineData,
  CourseQuery,
  CreateCourseRequest,
  PageData,
  PageQuery,
  InstructorCourseQuery,
  UpdateCourseRequest,
  VersionRequest,
} from '@lms/contracts';
import { Course } from './entities/course.entity';
import { Chapter } from '../chapters/entities/chapter.entity';
import { Lesson } from '../lessons/entities/lesson.entity';
import { LearningItem } from '../learning-items/entities/learning-item.entity';
import { Enrollment } from '../enrollments/entities/enrollment.entity';
import { chapterData } from '../chapters/chapters.service';
import { lessonData } from '../lessons/lessons.service';
import { learningItemData } from '../learning-items/learning-items.service';

export function courseData(saved: Course): CourseData {
  // Chỉ trả các trường được CourseData cho phép, không trả thẳng entity database.
  // Timestamps từ PostgreSQL được chuyển từ Date sang chuỗi ISO 8601 UTC.
  return {
    id: saved.id,
    instructorId: saved.instructorId,
    title: saved.title,
    description: saved.description,
    thumbnailUrl: saved.thumbnailUrl,
    status: saved.status,
    version: saved.version,
    contentVersion: saved.contentVersion,
    createdAt: saved.createdAt.toISOString(),
    updatedAt: saved.updatedAt.toISOString(),
  };
}
@Injectable()
export class CoursesService {
  constructor(
    // NestJS/TypeORM cấp repository của bảng courses qua dependency injection.
    @InjectRepository(Course) private readonly repository: Repository<Course>,
    @InjectRepository(Chapter)
    private readonly chapters: Repository<Chapter>,
    @InjectRepository(Lesson)
    private readonly lessons: Repository<Lesson>,
    @InjectRepository(LearningItem)
    private readonly items: Repository<LearningItem>,
    @InjectRepository(Enrollment)
    private readonly enrollments: Repository<Enrollment>,
  ) {}

  async outline(id: string, user: AuthUser): Promise<CourseOutlineData> {
    const course = await this.findReadableCourse(id, user);
    const [chapters, lessons, items] = await Promise.all([
      this.chapters.find({ where: { courseId: id }, order: { order: 'ASC' } }),
      this.lessons.find({ where: { courseId: id }, order: { order: 'ASC' } }),
      this.items.find({ where: { courseId: id }, order: { order: 'ASC' } }),
    ]);
    return {
      courseId: id,
      revisionId: id,
      contentVersion: course.contentVersion,
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
    };
  }

  async create(dto: CreateCourseRequest, user: AuthUser): Promise<CourseData> {
    // Bước 1: dto đã qua validation tại controller; user do auth guard xác minh.
    // Bản mẫu dùng MockAuthGuard. Chỉ Instructor ACTIVE được tạo khóa học.
    if (user.role !== 'INSTRUCTOR' || user.status !== 'ACTIVE')
      throw new ForbiddenException('Active instructor account required');
    // Bước 2: Tạo entity trong bộ nhớ; repository.create chưa ghi vào PostgreSQL.
    // Owner lấy từ user đã xác thực, không nhận instructorId tùy ý từ request.
    // Server đặt trạng thái DRAFT và hai version ban đầu bằng 1.
    const course = this.repository.create({
      instructorId: user.id,
      title: dto.title,
      description: dto.description,
      thumbnailUrl: dto.thumbnailUrl ?? null,
      status: 'DRAFT',
      version: 1,
      contentVersion: 1,
    });
    let saved: Course;
    try {
      // Bước 3: INSERT vào PostgreSQL theo DATABASE_URL đã cấu hình.
      // TypeORM/database tạo UUID và timestamps; saved chứa dữ liệu sau khi lưu.
      saved = await this.repository.save(course);
    } catch {
      // Báo HTTP 503 khi lưu thất bại; không đưa SQL/credentials ra response.
      // Global exception filter sẽ bọc lỗi theo error envelope dùng chung.
      throw new ServiceUnavailableException('Course storage is unavailable');
    }
    // Bước 4: Map entity sang CourseData. Controller sẽ bọc { data, meta }
    // và trả HTTP 201; service không phụ thuộc trực tiếp vào HTTP response.
    return courseData(saved);
  }

  async list(query: CourseQuery): Promise<PageData<CourseData>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = query.search
      ? [
          { status: 'PUBLISHED' as const, title: ILike(`%${query.search}%`) },
          {
            status: 'PUBLISHED' as const,
            description: ILike(`%${query.search}%`),
          },
        ]
      : [{ status: 'PUBLISHED' as const }];
    const filtered = query.instructorId
      ? where.map((item) => ({ ...item, instructorId: query.instructorId }))
      : where;
    const [rows, total] = await this.repository.findAndCount({
      where: filtered,
      order: {
        [query.sort ?? 'createdAt']: query.direction === 'asc' ? 'ASC' : 'DESC',
      },
      skip: (page - 1) * limit,
      take: limit,
    });
    return {
      items: rows.map(courseData),
      page,
      limit,
      total,
    };
  }

  async listInstructorCourses(
    query: InstructorCourseQuery,
    user: AuthUser,
  ): Promise<PageData<CourseData>> {
    this.requireInstructor(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const base = {
      instructorId: user.id,
      ...(query.status ? { status: query.status } : {}),
    };
    const where = query.search
      ? [
          { ...base, title: ILike(`%${query.search}%`) },
          { ...base, description: ILike(`%${query.search}%`) },
        ]
      : base;
    const [rows, total] = await this.repository.findAndCount({
      where,
      order: {
        [query.sort ?? 'createdAt']: query.direction === 'asc' ? 'ASC' : 'DESC',
      },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items: rows.map(courseData), page, limit, total };
  }

  async listLearners(
    id: string,
    query: PageQuery,
    user: AuthUser,
  ): Promise<PageData<CourseLearnerData>> {
    this.requireInstructor(user);
    const course = await this.repository.findOneBy({ id });
    if (!course) throw new NotFoundException('Course not found');
    if (course.instructorId !== user.id)
      throw new ForbiddenException('Course ownership required');
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [rows, total] = await this.enrollments.findAndCount({
      where: { courseId: id, status: In(['ACTIVE', 'COMPLETED']) },
      order: { enrolledAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return {
      items: rows.map((enrollment) => ({
        userId: enrollment.userId,
        enrollment: {
          enrollmentId: enrollment.id,
          courseId: enrollment.courseId,
          userId: enrollment.userId,
          status: enrollment.status,
          enrolledAt: enrollment.enrolledAt.toISOString(),
          contentVersion: enrollment.contentVersion,
        },
      })),
      page,
      limit,
      total,
    };
  }

  async get(id: string): Promise<CourseData> {
    const course = await this.repository.findOneBy({
      id,
      status: 'PUBLISHED',
    });
    if (!course) throw new NotFoundException('Course not found');
    return courseData(course);
  }

  private async findReadableCourse(
    id: string,
    user: AuthUser,
  ): Promise<Course> {
    const course = await this.repository.findOneBy({ id });
    if (!course) throw new NotFoundException('Course not found');
    if (user.role === 'ADMIN' || course.instructorId === user.id) return course;
    if (course.status !== 'PUBLISHED')
      throw new ForbiddenException('Enrollment or course ownership required');
    const enrollment = await this.enrollments.findOneBy({
      courseId: id,
      userId: user.id,
      status: In(['ACTIVE', 'COMPLETED']),
    });
    if (!enrollment)
      throw new ForbiddenException('Enrollment or course ownership required');
    return course;
  }

  async update(
    id: string,
    dto: UpdateCourseRequest,
    user: AuthUser,
  ): Promise<CourseData> {
    this.requireInstructor(user);
    const changes = Object.fromEntries(
      Object.entries(dto).filter(([key]) => key !== 'expectedVersion'),
    ) as Partial<Course>;
    if (Object.keys(changes).length === 0)
      throw new ConflictException({
        code: 'VALIDATION_ERROR',
        message: 'At least one course field must be changed',
        details: {},
      });

    const current = await this.repository.findOneBy({ id });
    this.assertOwnerAndVersion(current, id, user, dto.expectedVersion);
    if (current.status === 'PUBLISHED')
      throw new ConflictException({
        code: 'INVALID_COURSE_TRANSITION',
        message: 'Published course must be updated through a revision',
        details: {},
      });

    const result = await this.repository.update(
      { id, instructorId: user.id, version: dto.expectedVersion },
      { ...changes, version: dto.expectedVersion + 1 },
    );
    if (!result.affected)
      throw this.versionConflict(dto.expectedVersion, dto.expectedVersion + 1);
    const saved = await this.repository.findOneByOrFail({ id });
    return courseData(saved);
  }

  async remove(id: string, dto: VersionRequest, user: AuthUser): Promise<void> {
    this.requireInstructor(user);
    const current = await this.repository.findOneBy({ id });
    this.assertOwnerAndVersion(current, id, user, dto.expectedVersion);
    if (current!.status === 'PUBLISHED')
      throw new ConflictException({
        code: 'INVALID_COURSE_TRANSITION',
        message: 'Published course cannot be deleted',
        details: {},
      });
    const result = await this.repository.delete({
      id,
      instructorId: user.id,
      version: dto.expectedVersion,
    });
    if (!result.affected)
      throw this.versionConflict(dto.expectedVersion, dto.expectedVersion + 1);
  }

  private requireInstructor(user: AuthUser): void {
    if (user.role !== 'INSTRUCTOR' || user.status !== 'ACTIVE')
      throw new ForbiddenException('Active instructor account required');
  }

  private assertOwnerAndVersion(
    course: Course | null,
    id: string,
    user: AuthUser,
    expectedVersion: number,
  ): asserts course is Course {
    if (!course) throw new NotFoundException('Course not found');
    if (course.instructorId !== user.id)
      throw new ForbiddenException('Course ownership required');
    if (course.version !== expectedVersion)
      throw this.versionConflict(expectedVersion, course.version);
  }

  private versionConflict(expectedVersion: number, currentVersion: number) {
    return new ConflictException({
      code: 'VERSION_CONFLICT',
      message: 'Course was changed by another request',
      details: { expectedVersion, currentVersion },
    });
  }
}
