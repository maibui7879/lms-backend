import { Injectable } from '@nestjs/common';
import { isDeepStrictEqual } from 'node:util';
import type {
  EnrollmentSnapshotData,
  MasteryData,
  MasteryHistoryPoint,
  PageQuery,
  PageData,
} from '@lms/contracts';
import type { EntityManager } from 'typeorm';
import { LearningDatabase } from '../../../database/learning-database';
import { MasteryCurrent } from '../entities/mastery-current.entity';
import { MasterySnapshot } from '../entities/mastery-snapshot.entity';

function enrollmentKey({
  enrollmentId,
  enrolledAt,
  contentVersion,
}: EnrollmentSnapshotData) {
  return { enrollmentId, enrolledAt: new Date(enrolledAt), contentVersion };
}

export function masteryAttemptKey({
  attemptId,
  assessmentVersion,
}: Pick<MasteryHistoryPoint, 'attemptId' | 'assessmentVersion'>) {
  return `${attemptId}:${assessmentVersion}`;
}

@Injectable()
export class MasteryResultsRepository {
  constructor(private readonly database: LearningDatabase) {}

  refresh<T>(
    enrollment: EnrollmentSnapshotData,
    operation: (manager: EntityManager) => Promise<T>,
  ) {
    return this.database.run((database) =>
      database.transaction(async (manager) => {
        // Serialize refreshes for one enrollment so a stale refresh cannot overwrite the newer result.
        await manager.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
          [`mastery:${enrollment.enrollmentId}`],
        );
        return operation(manager);
      }),
    );
  }

  async saveCurrent(
    manager: EntityManager,
    enrollment: EnrollmentSnapshotData,
    summary: Omit<MasteryData, 'updatedAt'>,
  ): Promise<MasteryData> {
    const repository = manager.getRepository(MasteryCurrent);
    const key = enrollmentKey(enrollment);
    const previous = await repository.findOneBy(key);
    let timestamp = Date.now();
    if (previous) {
      const { updatedAt, ...previousSummary } = previous.data;
      if (isDeepStrictEqual(previousSummary, summary)) return previous.data;
      timestamp = Math.max(timestamp, Date.parse(updatedAt) + 1);
    }
    const data = { ...summary, updatedAt: new Date(timestamp).toISOString() };
    await repository.upsert(
      {
        ...key,
        courseId: enrollment.courseId,
        userId: enrollment.userId,
        data,
      },
      ['enrollmentId', 'enrolledAt', 'contentVersion'],
    );
    return data;
  }

  async snapshotKeys(
    manager: EntityManager,
    enrollment: EnrollmentSnapshotData,
  ) {
    const snapshots = await manager.getRepository(MasterySnapshot).find({
      where: enrollmentKey(enrollment),
      select: { attemptId: true, assessmentVersion: true },
    });
    return new Set(snapshots.map(masteryAttemptKey));
  }

  async saveSnapshots(
    manager: EntityManager,
    enrollment: EnrollmentSnapshotData,
    points: MasteryHistoryPoint[],
  ) {
    const repository = manager.getRepository(MasterySnapshot);
    const key = enrollmentKey(enrollment);
    for (let start = 0; start < points.length; start += 200) {
      await repository
        .createQueryBuilder()
        .insert()
        .values(
          points.slice(start, start + 200).map((point) => ({
            ...key,
            attemptId: point.attemptId,
            assessmentVersion: point.assessmentVersion,
            effectiveAt: new Date(point.effectiveAt),
            gradedAt: new Date(point.gradedAt),
            data: point,
          })),
        )
        .orIgnore()
        .execute();
    }
  }

  async history(
    manager: EntityManager,
    enrollment: EnrollmentSnapshotData,
    { page, limit }: Required<PageQuery>,
  ): Promise<PageData<MasteryHistoryPoint>> {
    const repository = manager.getRepository(MasterySnapshot);
    const where = enrollmentKey(enrollment);
    const total = await repository.countBy(where);
    const offset = (page - 1) * limit;
    const rows =
      offset < total
        ? await repository.find({
            where,
            order: {
              effectiveAt: 'DESC',
              gradedAt: 'DESC',
              attemptId: 'DESC',
              assessmentVersion: 'DESC',
            },
            skip: offset,
            take: limit,
          })
        : [];
    return { page, limit, total, items: rows.map(({ data }) => data) };
  }
}
