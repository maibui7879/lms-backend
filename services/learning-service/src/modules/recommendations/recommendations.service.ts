import { Injectable } from '@nestjs/common';
import type {
  AuthUser,
  PageData,
  PageQuery,
  RecommendationData,
} from '@lms/contracts';
import { apiError } from '../../common/api-error';
import { LearningDatabase } from '../../database/learning-database';
import { CourseClient } from '../../integrations/course.client';
import type { CourseRequestContext } from '../../integrations/course.client';
import { QuizClient } from '../../integrations/quiz.client';
import { MasteryService } from '../mastery/mastery.service';
import { weightedScorePercent } from '../mastery/rules/weighted-score';
import { ProgressService } from '../progress/progress.service';
import {
  lessonRecommendations,
  quizRecommendation,
} from './rules/content-recommendations';
import { weakSkills } from './rules/weak-skills';
import { recommendationTargets } from './rules/prerequisite-graph';
import {
  masteryTrends,
  rankRecommendations,
  rankTargets,
} from './rules/rank-recommendations';
import type { RecommendationCandidate } from './rules/rank-recommendations';
import { SkillPrerequisitesRepository } from './repositories/skill-prerequisites.repository';

@Injectable()
export class RecommendationsService {
  constructor(
    private readonly course: CourseClient,
    private readonly mastery: MasteryService,
    private readonly progress: ProgressService,
    private readonly quiz: QuizClient,
    private readonly prerequisites: SkillPrerequisitesRepository,
    private readonly database: LearningDatabase,
  ) {}

  async list(
    user: AuthUser,
    context: CourseRequestContext,
    { page, limit }: Required<PageQuery>,
  ): Promise<PageData<RecommendationData>> {
    if (user.role !== 'STUDENT' || user.status !== 'ACTIVE')
      throw apiError('FORBIDDEN', 'An active student account is required');

    const candidates: RecommendationCandidate[] = [];
    let now: number | undefined;
    for await (const enrollment of this.course.enrollments(context)) {
      const structure = await this.course.structure(enrollment, context);
      now ??= await this.database.readTime();
      const { skills, activeSkills, history } =
        await this.mastery.recommendationEvidence(enrollment, structure, now);
      const weak = weakSkills(skills, new Set(activeSkills.keys()));
      if (!weak.length) continue;
      const [{ edges }, { lessons, lessonOrders, quizzes }] = await Promise.all(
        [
          this.prerequisites.get(enrollment.courseId),
          this.progress.recommendableContent(enrollment, structure, now),
        ],
      );
      const targets = rankTargets(
        recommendationTargets(
          weak,
          skills,
          activeSkills,
          edges,
          masteryTrends(history, now, weightedScorePercent),
        ),
      );
      candidates.push(
        ...lessonRecommendations(
          enrollment.courseId,
          lessons,
          targets,
          lessonOrders,
        ),
      );
      for (const item of quizzes) {
        const availability = await this.quiz.recommendationContext(
          item.quizId,
          {
            courseId: enrollment.courseId,
            userId: user.id,
            assessmentVersion: item.assessmentVersion,
          },
          context.requestId,
        );
        const recommendation = quizRecommendation(
          item,
          availability,
          targets,
          lessonOrders,
        );
        if (recommendation) candidates.push(recommendation);
      }
    }
    const recommendations = rankRecommendations(candidates);
    const offset = (page - 1) * limit;
    return {
      page,
      limit,
      total: recommendations.length,
      items: recommendations.slice(offset, offset + limit),
    };
  }
}
