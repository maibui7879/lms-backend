import { Injectable } from '@nestjs/common';
import type {
  CourseLearningStructure,
  CourseProgressData,
  EnrollmentSnapshotData,
  GradedAssessmentSummary,
  LearnerProgressDetail,
  LearnerProgressSummary,
  LearningAnalyticsData,
  LearningAnalyticsQuery,
  LearningPercentBand,
  LearningReportDateQuery,
  LearningStatisticsData,
  LearningWeakSkillsData,
  PageData,
  PageQuery,
} from '@lms/contracts';
import { apiError } from '../../common/api-error';
import { LearningDatabase } from '../../database/learning-database';
import { CourseClient } from '../../integrations/course.client';
import type { CourseRequestContext } from '../../integrations/course.client';
import { MasteryService } from '../mastery/mastery.service';
import { ProgressService } from '../progress/progress.service';
import { hasSkillEvidence } from '../recommendations/rules/weak-skills';

function summarize({
  userId,
  enrollmentId: _enrollmentId,
  ...progress
}: CourseProgressData): LearnerProgressSummary {
  return { userId, progress };
}

function inRange({ fromAt, toAt }: LearningReportDateQuery) {
  const from = fromAt === undefined ? -Infinity : Date.parse(fromAt);
  const to = toAt === undefined ? Infinity : Date.parse(toAt);
  if (Number.isNaN(from) || Number.isNaN(to) || from >= to)
    throw apiError('VALIDATION_ERROR', 'fromAt must be earlier than toAt');
  return (time: string | Date) => {
    const value = typeof time === 'string' ? Date.parse(time) : time.getTime();
    return value >= from && value < to;
  };
}

function bands(): LearningPercentBand[] {
  return [0, 25, 50, 75].map((fromPercent) => ({
    fromPercent,
    toPercent: fromPercent + 25,
    count: 0,
  }));
}

function countBand(distribution: LearningPercentBand[], percent: number) {
  distribution[Math.min(Math.floor(percent / 25), distribution.length - 1)]
    .count++;
}

type ScoreSeries = Omit<
  LearningAnalyticsData['quizScores'][number],
  'trend'
> & {
  days: Map<string, { gradedAttempts: number; totalScorePercent: number }>;
};

function countGrade(
  series: Map<string, ScoreSeries>,
  result: GradedAssessmentSummary,
) {
  const { quizId, assessmentVersion, score, maxScore, gradedAt } = result;
  const percent = (score / maxScore) * 100;
  if (
    !Number.isFinite(percent) ||
    percent < 0 ||
    percent > 100 ||
    maxScore <= 0
  )
    return;
  const key = `${quizId}:${assessmentVersion}`;
  const quiz = series.get(key) ?? {
    quizId,
    assessmentVersion,
    gradedAttempts: 0,
    scoreDistribution: bands(),
    days: new Map<
      string,
      { gradedAttempts: number; totalScorePercent: number }
    >(),
  };
  series.set(key, quiz);
  quiz.gradedAttempts++;
  countBand(quiz.scoreDistribution, percent);
  const day = new Date(gradedAt).toISOString().slice(0, 10);
  const totals = quiz.days.get(day) ?? {
    gradedAttempts: 0,
    totalScorePercent: 0,
  };
  totals.gradedAttempts++;
  totals.totalScorePercent += percent;
  quiz.days.set(day, totals);
}

@Injectable()
export class InstructorReportsService {
  constructor(
    private readonly course: CourseClient,
    private readonly progress: ProgressService,
    private readonly mastery: MasteryService,
    private readonly database: LearningDatabase,
  ) {}

  async list(
    courseId: string,
    query: Required<PageQuery>,
    context: CourseRequestContext,
  ): Promise<PageData<LearnerProgressSummary>> {
    const { items, ...page } = await this.course.learnerPage(
      courseId,
      context,
      query,
    );
    const snapshotFor = this.snapshots(context);
    const summaries: LearnerProgressSummary[] = [];
    for (const { enrollment } of items) {
      const { progress } = await this.progress.reportingProgress(
        enrollment,
        await snapshotFor(enrollment),
      );
      summaries.push(summarize(progress));
    }
    return { ...page, items: summaries };
  }

  async detail(
    courseId: string,
    userId: string,
    context: CourseRequestContext,
  ): Promise<LearnerProgressDetail> {
    for await (const learner of this.roster(courseId, context)) {
      if (learner.userId !== userId) continue;
      const { enrollment } = learner;
      const snapshot = await this.course.structure(enrollment, context);
      const { progress, ...detail } = await this.progress.reportingDetail(
        enrollment,
        snapshot,
      );
      return { ...summarize(progress), ...detail };
    }
    throw apiError('NOT_FOUND', 'Learner is not enrolled in this course');
  }

  async statistics(
    courseId: string,
    query: LearningReportDateQuery,
    context: CourseRequestContext,
  ): Promise<LearningStatisticsData> {
    const included = inRange(query);
    const snapshotFor = this.snapshots(context);
    let enrolledCount = 0;
    let completedCount = 0;
    let totalProgress = 0;
    for await (const { enrollment } of this.roster(courseId, context)) {
      if (!included(enrollment.enrolledAt)) continue;
      const { progress } = await this.progress.reportingProgress(
        enrollment,
        await snapshotFor(enrollment),
      );
      enrolledCount++;
      totalProgress += progress.lessonProgressPercent;
      if (progress.status === 'COMPLETED') completedCount++;
    }
    return {
      courseId,
      enrolledCount,
      completedCount,
      completionRatePercent: enrolledCount
        ? (completedCount / enrolledCount) * 100
        : null,
      averageProgressPercent: enrolledCount
        ? totalProgress / enrolledCount
        : null,
      updatedAt: new Date().toISOString(),
    };
  }

  async weakSkills(
    courseId: string,
    context: CourseRequestContext,
  ): Promise<LearningWeakSkillsData> {
    const snapshotFor = this.snapshots(context);
    let now: number | undefined;
    let enrolledCount = 0;
    const bySkill = new Map<
      string,
      Omit<LearningWeakSkillsData['skills'][number], 'weakRatePercent'>
    >();
    for await (const { enrollment } of this.roster(courseId, context)) {
      now ??= await this.database.readTime();
      enrolledCount++;
      const { skills, activeSkills } =
        await this.mastery.recommendationEvidence(
          enrollment,
          await snapshotFor(enrollment),
          now,
        );
      for (const skill of skills) {
        const skillName = activeSkills.get(skill.skillId);
        if (skillName === undefined || !hasSkillEvidence(skill)) continue;
        const total = bySkill.get(skill.skillId) ?? {
          skillId: skill.skillId,
          skillName,
          assessedLearnerCount: 0,
          weakLearnerCount: 0,
        };
        total.assessedLearnerCount++;
        if (skill.level === 'BEGINNER') total.weakLearnerCount++;
        bySkill.set(skill.skillId, total);
      }
    }
    const skills = [...bySkill.values()]
      .filter(({ weakLearnerCount }) => weakLearnerCount > 0)
      .map((skill) => ({
        ...skill,
        weakRatePercent:
          (skill.weakLearnerCount / skill.assessedLearnerCount) * 100,
      }))
      .sort(
        (a, b) =>
          b.weakLearnerCount - a.weakLearnerCount ||
          a.skillId.localeCompare(b.skillId),
      );
    return {
      courseId,
      enrolledCount,
      skills,
      updatedAt: new Date(now ?? Date.now()).toISOString(),
    };
  }

  async analytics(
    courseId: string,
    query: LearningAnalyticsQuery,
    context: CourseRequestContext,
  ): Promise<LearningAnalyticsData> {
    const included = inRange(query);
    const snapshotFor = this.snapshots(context);
    const scores = new Map<string, ScoreSeries>();
    const lessonProgressDistribution = bands();
    const lessonDays = new Map<string, number>();
    let enrolledCount = 0;
    for await (const learner of this.roster(courseId, context)) {
      if (query.classId && learner.classId === undefined)
        throw apiError(
          'SERVICE_UNAVAILABLE',
          'Course did not provide class membership',
        );
      if (query.classId && learner.classId?.toLowerCase() !== query.classId)
        continue;
      enrolledCount++;
      const { progress, finishedLessons, evidence } =
        await this.progress.reportingProgress(
          learner.enrollment,
          await snapshotFor(learner.enrollment),
        );
      countBand(lessonProgressDistribution, progress.lessonProgressPercent);
      for (const { completedAt } of finishedLessons) {
        if (!included(completedAt)) continue;
        const day = completedAt.toISOString().slice(0, 10);
        lessonDays.set(day, (lessonDays.get(day) ?? 0) + 1);
      }
      for (const { result } of evidence.attempts) {
        if (
          result.quizType !== 'GRADED' ||
          !included(result.gradedAt) ||
          (query.quizId && result.quizId !== query.quizId) ||
          (query.assessmentVersion &&
            result.assessmentVersion !== query.assessmentVersion)
        )
          continue;
        countGrade(scores, result);
      }
    }
    const lessonProgressTrend = [...lessonDays]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, completedLessons]) => ({ day, completedLessons }));
    const quizScores = [...scores.values()]
      .sort(
        (a, b) =>
          a.quizId.localeCompare(b.quizId) ||
          a.assessmentVersion - b.assessmentVersion,
      )
      .map(({ days, ...series }) => ({
        ...series,
        trend: [...days]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([day, { gradedAttempts, totalScorePercent }]) => ({
            day,
            gradedAttempts,
            averageScorePercent: totalScorePercent / gradedAttempts,
          })),
      }));
    return {
      courseId,
      enrolledCount,
      lessonProgressDistribution,
      lessonProgressTrend,
      quizScores,
      updatedAt: new Date().toISOString(),
    };
  }

  private snapshots(context: CourseRequestContext) {
    const values = new Map<number, Promise<CourseLearningStructure>>();
    return (enrollment: EnrollmentSnapshotData) => {
      let snapshot = values.get(enrollment.contentVersion);
      if (!snapshot) {
        snapshot = this.course.structure(enrollment, context);
        values.set(enrollment.contentVersion, snapshot);
      }
      return snapshot;
    };
  }

  private async *roster(courseId: string, context: CourseRequestContext) {
    const seen = new Set<string>();
    const limit = 100;
    let expectedTotal: number | undefined;
    for (let page = 1; ; page++) {
      const { items, total } = await this.course.learnerPage(
        courseId,
        context,
        { page, limit },
      );
      if (expectedTotal !== undefined && expectedTotal !== total)
        throw apiError(
          'SERVICE_UNAVAILABLE',
          'Course roster changed while reading',
        );
      expectedTotal = total;
      for (const learner of items) {
        if (seen.has(learner.userId))
          throw apiError(
            'SERVICE_UNAVAILABLE',
            'Course returned a duplicate learner',
          );
        seen.add(learner.userId);
        yield learner;
      }
      if (page * limit >= total) return;
    }
  }
}
