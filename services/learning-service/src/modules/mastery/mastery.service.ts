import { Injectable } from '@nestjs/common';
import { MoreThanOrEqual } from 'typeorm';
import type { EntityManager } from 'typeorm';
import type {
  AuthUser,
  EnrollmentSnapshotData,
  GradedAssessmentSummary,
  MasteryData,
  MasteryHistoryPoint,
  PageData,
  PageQuery,
  SkillMasteryData,
} from '@lms/contracts';
import { apiError } from '../../common/api-error';
import { CourseClient } from '../../integrations/course.client';
import type { CourseRequestContext } from '../../integrations/course.client';
import { lockCourseMigration } from '../../database/course-migration-lock';
import { CourseItemMigration } from '../progress/entities/course-item-migration.entity';
import { AssessmentAttempt } from '../progress-sync/entities/assessment-attempt.entity';
import { MasteryCalculator } from './mastery-calculator';
import { CourseSkill } from './entities/course-skill.entity';
import {
  MasteryResultsRepository,
  masteryAttemptKey,
} from './repositories/mastery-results.repository';
import { classifyMastery, readMasteryThresholds } from './rules/mastery-level';
import { masteryTimeline } from './rules/mastery-timeline';

function usableScores(
  result: GradedAssessmentSummary,
  skillNames: Map<string, string>,
) {
  // Producers should emit one summary per skill. Discard ambiguous legacy entries.
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const { skillId } of result.skillScores) {
    if (seen.has(skillId)) repeated.add(skillId);
    seen.add(skillId);
  }
  return result.skillScores.filter(
    ({ skillId, score, maxScore }) =>
      skillNames.has(skillId) &&
      !repeated.has(skillId) &&
      Number.isFinite(score) &&
      Number.isFinite(maxScore) &&
      maxScore > 0 &&
      score >= 0 &&
      score <= maxScore,
  );
}

@Injectable()
export class MasteryService {
  private readonly thresholds = readMasteryThresholds(process.env);

  constructor(
    private readonly courses: CourseClient,
    private readonly saved: MasteryResultsRepository,
    private readonly calculator: MasteryCalculator,
  ) {}

  async current(
    courseId: string,
    user: AuthUser,
    context: CourseRequestContext,
  ): Promise<MasteryData> {
    return this.refresh(courseId, user, context, (manager, enrollment, data) =>
      this.saved.saveCurrent(manager, enrollment, data),
    );
  }

  async history(
    courseId: string,
    pageQuery: Required<PageQuery>,
    user: AuthUser,
    context: CourseRequestContext,
  ): Promise<PageData<MasteryHistoryPoint>> {
    return this.refresh(
      courseId,
      user,
      context,
      async (manager, enrollment, data) => {
        await this.saved.saveCurrent(manager, enrollment, data);
        return this.saved.history(manager, enrollment, pageQuery);
      },
    );
  }

  private async refresh<T>(
    courseId: string,
    user: AuthUser,
    context: CourseRequestContext,
    finish: (
      manager: EntityManager,
      enrollment: EnrollmentSnapshotData,
      data: Omit<MasteryData, 'updatedAt'>,
    ) => Promise<T>,
  ): Promise<T> {
    if (user.role !== 'STUDENT' || user.status !== 'ACTIVE')
      throw apiError('FORBIDDEN', 'An active student account is required');

    for await (const enrollment of this.courses.enrollments(context)) {
      if (
        enrollment.courseId.toLowerCase() !== courseId ||
        enrollment.userId !== user.id ||
        enrollment.status === 'CANCELLED'
      )
        continue;
      const structure = await this.courses.structure(enrollment, context);
      return this.saved.refresh(enrollment, async (manager) => {
        await lockCourseMigration(manager, courseId);
        const migrations = await manager
          .getRepository(CourseItemMigration)
          .find({
            where: { courseId },
            order: {
              contentVersion: 'DESC',
              appliedAt: 'DESC',
              targetItemId: 'ASC',
            },
          });
        const attempts = await manager.getRepository(AssessmentAttempt).findBy({
          courseId,
          userId: user.id,
          gradedAt: MoreThanOrEqual(new Date(enrollment.enrolledAt)),
        });
        const skills = await manager
          .getRepository(CourseSkill)
          .findBy({ courseId });
        const skillNames = new Map(skills.map(({ id, name }) => [id, name]));
        const timeline = masteryTimeline(
          enrollment,
          structure,
          migrations,
          attempts,
        );
        const results = timeline.results.flatMap((entry) => {
          const scores = usableScores(entry.result, skillNames);
          return scores.length ? [{ ...entry, scores }] : [];
        });
        const existing = await this.saved.snapshotKeys(manager, enrollment);
        const recordedAt = new Date().toISOString();
        const points = results.flatMap(
          ({ result, scope, effectiveAt }, index) => {
            if (existing.has(masteryAttemptKey(result))) return [];
            return [
              {
                attemptId: result.attemptId,
                assessmentVersion: result.assessmentVersion,
                contentVersion: enrollment.contentVersion,
                gradedAt: result.gradedAt,
                effectiveAt: new Date(effectiveAt).toISOString(),
                recordedAt,
                algorithmVersion: this.calculator.algorithmVersion,
                skills: this.summarize(
                  results
                    .slice(0, index + 1)
                    .filter(({ key }) => scope.keys.has(key))
                    .map(({ scores }) => scores),
                  skillNames,
                ),
              },
            ];
          },
        );
        await this.saved.saveSnapshots(manager, enrollment, points);
        const contributing = results.filter(({ key }) =>
          timeline.currentScope.keys.has(key),
        );
        return finish(manager, enrollment, {
          courseId,
          userId: user.id,
          skills: this.summarize(
            contributing.map(({ scores }) => scores),
            skillNames,
          ),
          algorithmVersion: this.calculator.algorithmVersion,
        });
      });
    }
    throw apiError('ENROLLMENT_REQUIRED', 'Course access is required');
  }

  private summarize(
    attempts: GradedAssessmentSummary['skillScores'][],
    skillNames: Map<string, string>,
  ): SkillMasteryData[] {
    const evidence = new Map<string, GradedAssessmentSummary['skillScores']>();
    for (const scores of attempts) {
      for (const score of scores) {
        const { skillId } = score;
        const entry = evidence.get(skillId) ?? [];
        entry.push(score);
        evidence.set(skillId, entry);
      }
    }

    return [...evidence.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .flatMap(([skillId, scores]) => {
        const scorePercent = this.calculator.scorePercent(scores);
        const evidenceCount = scores.length;
        let questionCount: number | null = 0;
        for (const entry of scores) {
          if (
            entry.questionCount === undefined ||
            !Number.isSafeInteger(entry.questionCount) ||
            entry.questionCount < 1 ||
            !Number.isSafeInteger(questionCount + entry.questionCount)
          ) {
            questionCount = null;
            break;
          }
          questionCount += entry.questionCount;
        }
        const level = classifyMastery(
          { scorePercent, evidenceCount },
          this.thresholds,
        );
        return level === null
          ? []
          : [
              {
                skillId,
                skillName: skillNames.get(skillId),
                scorePercent,
                evidenceCount,
                questionCount,
                level,
              },
            ];
      });
  }
}
