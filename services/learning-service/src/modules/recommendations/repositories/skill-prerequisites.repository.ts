import { Injectable } from '@nestjs/common';
import type {
  CourseSkillPrerequisites,
  SaveSkillPrerequisitesRequest,
} from '@lms/contracts';
import { In } from 'typeorm';
import { apiError } from '../../../common/api-error';
import { LearningDatabase } from '../../../database/learning-database';
import { CourseSkill } from '../../mastery/entities/course-skill.entity';
import { SkillPrerequisites } from '../entities/skill-prerequisites.entity';
import { normalizePrerequisites } from '../rules/prerequisite-graph';

@Injectable()
export class SkillPrerequisitesRepository {
  constructor(private readonly database: LearningDatabase) {}

  async get(courseId: string): Promise<CourseSkillPrerequisites> {
    const graph = await this.database.run((database) =>
      database.getRepository(SkillPrerequisites).findOneBy({ courseId }),
    );
    return graph ?? { courseId, version: 0, edges: [] };
  }

  save(
    courseId: string,
    input: SaveSkillPrerequisitesRequest,
  ): Promise<CourseSkillPrerequisites> {
    return this.database.run((database) =>
      database.transaction(async (manager) => {
        await manager.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
          [`skill-prerequisites:${courseId}`],
        );
        const graphs = manager.getRepository(SkillPrerequisites);
        const previous = await graphs.findOneBy({ courseId });
        if ((previous?.version ?? 0) !== input.expectedVersion)
          throw apiError(
            'VERSION_CONFLICT',
            'Reload the latest prerequisite graph',
          );
        const ids = input.edges.flatMap(({ skillId, prerequisiteSkillId }) => [
          skillId.toLowerCase(),
          prerequisiteSkillId.toLowerCase(),
        ]);
        const active = await manager.getRepository(CourseSkill).find({
          select: { id: true },
          where: { courseId, id: In([...new Set(ids)]), status: 'ACTIVE' },
          lock: { mode: 'pessimistic_read' },
        });
        const result = normalizePrerequisites(
          input.edges,
          new Set(active.map(({ id }) => id)),
        );
        if (result.error)
          throw apiError(
            result.error,
            result.message,
            result.skillIds ? { skillIds: result.skillIds } : {},
          );
        return graphs.save({
          courseId,
          version: input.expectedVersion + 1,
          edges: result.edges,
        });
      }),
    );
  }
}
