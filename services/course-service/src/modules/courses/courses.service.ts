import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import type {
  AuthUser,
  CourseData,
  CourseQuery,
  CreateCourseRequest,
  PageData,
  UpdateCourseRequest,
  VersionRequest,
} from '@lms/contracts';
import { Course } from './entities/course.entity';

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
  ) {}

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
      ? where.map(item => ({ ...item, instructorId: query.instructorId }))
      : where;
    const [rows, total] = await this.repository.findAndCount({
      where: filtered,
      order: { [query.sort ?? 'createdAt']: query.direction === 'asc' ? 'ASC' : 'DESC' },
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

  async get(id: string): Promise<CourseData> {
    const course = await this.repository.findOneBy({
      id,
      status: 'PUBLISHED',
    });
    if (!course) throw new NotFoundException('Course not found');
    return courseData(course);
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
