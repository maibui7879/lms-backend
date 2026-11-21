import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type {
  CreateCourseSkillRequest,
  UpdateCourseSkillRequest,
} from '@lms/contracts';
import { In } from 'typeorm';
import { apiError } from '../../../common/api-error';
import { LearningDatabase } from '../../../database/learning-database';
import { CourseSkill } from '../entities/course-skill.entity';

@Injectable()
export class CourseSkillsRepository {
  constructor(private readonly database: LearningDatabase) {}

  list(courseId: string, activeOnly: boolean) {
    return this.database.run((database) =>
      database.getRepository(CourseSkill).find({
        where: activeOnly ? { courseId, status: 'ACTIVE' } : { courseId },
        order: { createdAt: 'ASC', id: 'ASC' },
      }),
    );
  }

  async get(courseId: string, id: string) {
    const skill = await this.database.run((database) =>
      database.getRepository(CourseSkill).findOneBy({ courseId, id }),
    );
    if (!skill) throw apiError('NOT_FOUND', 'Skill not found in the course');
    return skill;
  }

  async findActiveIds(courseId: string, ids: string[]): Promise<string[]> {
    const skills = await this.database.run((database) =>
      database.getRepository(CourseSkill).find({
        select: { id: true },
        where: { courseId, id: In(ids), status: 'ACTIVE' },
      }),
    );
    return skills.map(({ id }) => id);
  }

  create(courseId: string, input: CreateCourseSkillRequest) {
    const now = new Date();
    return this.database.run((database) =>
      database.getRepository(CourseSkill).save({
        ...input,
        id: randomUUID(),
        courseId,
        status: 'ACTIVE',
        version: 1,
        createdAt: now,
        updatedAt: now,
      }),
    );
  }

  update(courseId: string, id: string, input: UpdateCourseSkillRequest) {
    const { expectedVersion, ...changes } = input;
    return this.database.run((database) =>
      database.transaction(async (manager) => {
        const skills = manager.getRepository(CourseSkill);
        const skill = await skills.findOne({
          where: { courseId, id },
          lock: { mode: 'pessimistic_write' },
        });
        if (!skill)
          throw apiError('NOT_FOUND', 'Skill not found in the course');
        if (skill.version !== expectedVersion)
          throw apiError('VERSION_CONFLICT', 'Reload the latest skill');
        Object.assign(skill, {
          ...changes,
          version: skill.version + 1,
          updatedAt: new Date(),
        });
        return skills.save(skill);
      }),
    );
  }
}
