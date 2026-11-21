import { Column, Entity, PrimaryColumn, DataSource } from 'typeorm';
import { Injectable, Logger } from '@nestjs/common';
import type {
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { parseContract } from '@lms/contracts';
import type { MigrateCourseItemsRequest } from '@lms/contracts';

@Entity('course_migration_dispatches')
export class CourseMigrationDispatch {
  @PrimaryColumn('uuid') revisionId!: string;
  @Column('uuid') courseId!: string;
  @Column('jsonb') request!: MigrateCourseItemsRequest;
  @Column({ type: 'timestamptz', nullable: true }) sentAt!: Date | null;
}

/** HTTP delivery is retried with the same revision and payload after failures. */
@Injectable()
export class CourseMigrationDispatcher
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(CourseMigrationDispatcher.name);
  private timer?: ReturnType<typeof setInterval>;
  private pending?: Promise<void>;
  constructor(private readonly db: DataSource) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => {
      if (this.pending) return;
      this.pending = this.flush()
        .catch(() => {
          this.logger.warn(
            'Learning migration delivery failed; durable request retained for retry',
          );
        })
        .finally(() => {
          this.pending = undefined;
        });
    }, 5000);
    this.timer.unref();
  }
  async onApplicationShutdown(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.pending;
  }
  async flush(): Promise<void> {
    const base = process.env.LEARNING_URL;
    const token = process.env.LEARNING_SERVICE_TOKEN;
    if (!base || !token) return;
    await this.db.transaction(async (manager) => {
      const rows = await manager
        .getRepository(CourseMigrationDispatch)
        .createQueryBuilder('job')
        .where('job.sentAt IS NULL')
        .orderBy('job.revisionId', 'ASC')
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .take(10)
        .getMany();
      for (const row of rows) {
        const body = parseContract('MigrateCourseItemsRequest', row.request);
        const response = await fetch(
          new URL(`/api/v1/internal/courses/${row.courseId}/migrations`, base),
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
              'X-Request-Id': row.revisionId,
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(3000),
            redirect: 'error',
          },
        );
        if (!response.ok)
          throw new Error('Learning migration was not acknowledged');
        await manager.update(
          CourseMigrationDispatch,
          { revisionId: row.revisionId },
          { sentAt: new Date() },
        );
      }
    });
  }
}
