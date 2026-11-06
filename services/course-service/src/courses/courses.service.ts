import {
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { AuthUser, CourseData, CreateCourseRequest } from '@lms/contracts';
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
}
