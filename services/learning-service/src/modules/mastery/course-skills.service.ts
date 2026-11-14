import { Injectable } from '@nestjs/common';
import type {
  AuthUser,
  CourseSkillData,
  CreateCourseSkillRequest,
  UpdateCourseSkillRequest,
} from '@lms/contracts';
import { apiError } from '../../common/api-error';
import { CourseClient } from '../../integrations/course.client';
import type { CourseRequestContext } from '../../integrations/course.client';
import type { CourseSkill } from './entities/course-skill.entity';
import { CourseSkillsRepository } from './repositories/course-skills.repository';

function skillData(skill: CourseSkill): CourseSkillData {
  return {
    id: skill.id,
    courseId: skill.courseId,
    name: skill.name,
    description: skill.description,
    status: skill.status,
    version: skill.version,
    createdAt: skill.createdAt.toISOString(),
    updatedAt: skill.updatedAt.toISOString(),
  };
}

@Injectable()
export class CourseSkillsService {
  constructor(
    private readonly course: CourseClient,
    private readonly skills: CourseSkillsRepository,
  ) {}

  async list(courseId: string, user: AuthUser, context: CourseRequestContext) {
    if (user.role === 'STUDENT' && user.status === 'ACTIVE') {
      for await (const enrollment of this.course.enrollments(context)) {
        if (
          enrollment.courseId.toLowerCase() === courseId &&
          enrollment.userId === user.id &&
          enrollment.status !== 'CANCELLED'
        ) {
          return {
            skills: (await this.skills.list(courseId, true)).map(skillData),
          };
        }
      }
      throw apiError('ENROLLMENT_REQUIRED', 'Course access is required');
    }

    await this.requireManager(courseId, user, context);
    return { skills: (await this.skills.list(courseId, false)).map(skillData) };
  }

  async create(
    courseId: string,
    input: CreateCourseSkillRequest,
    user: AuthUser,
    context: CourseRequestContext,
  ) {
    await this.requireManager(courseId, user, context);
    return skillData(await this.skills.create(courseId, input));
  }

  async update(
    courseId: string,
    id: string,
    input: UpdateCourseSkillRequest,
    user: AuthUser,
    context: CourseRequestContext,
  ) {
    await this.requireManager(courseId, user, context);
    return skillData(await this.skills.update(courseId, id, input));
  }

  async getForService(courseId: string, id: string) {
    return skillData(await this.skills.get(courseId, id));
  }

  async requireAssignable(courseId: string, skillIds: string[]): Promise<void> {
    const found = new Set(await this.skills.findActiveIds(courseId, skillIds));
    const rejected = skillIds.filter((id) => !found.has(id));
    if (rejected.length) {
      throw apiError(
        'INVALID_SKILL_REFERENCE',
        'All new skills must be active and belong to the course',
        { skillIds: rejected },
      );
    }
  }

  private async requireManager(
    courseId: string,
    user: AuthUser,
    context: CourseRequestContext,
  ) {
    if (
      user.status !== 'ACTIVE' ||
      (user.role !== 'INSTRUCTOR' && user.role !== 'ADMIN')
    )
      throw apiError('FORBIDDEN', 'An active instructor or admin is required');

    await this.course.requireCourseManagement(courseId, context);
  }
}
