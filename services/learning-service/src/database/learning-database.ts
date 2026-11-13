import { Injectable } from '@nestjs/common';
import type { OnApplicationShutdown } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { apiError } from '../common/api-error';
import { AssessmentAttempt } from '../modules/progress-sync/entities/assessment-attempt.entity';
import { AssessmentSyncReceipt } from '../modules/progress-sync/entities/assessment-sync-receipt.entity';
import { CreateAssessmentAttempts1794528000001 } from './migrations/1794528000001-create-assessment-attempts';
import { CreateAssessmentSyncReceipts1794528000002 } from './migrations/1794528000002-create-assessment-sync-receipts';
import { BindSyncReceiptToAssessmentVersion1794528000003 } from './migrations/1794528000003-bind-sync-receipt-to-assessment-version';

export function createLearningDataSource(url: string | undefined): DataSource {
  if (!url) throw new Error('DATABASE_URL is required for Learning PostgreSQL');
  return new DataSource({
    type: 'postgres',
    url,
    entities: [AssessmentAttempt, AssessmentSyncReceipt],
    migrations: [
      CreateAssessmentAttempts1794528000001,
      CreateAssessmentSyncReceipts1794528000002,
      BindSyncReceiptToAssessmentVersion1794528000003,
    ],
    synchronize: false,
    connectTimeoutMS: 5000,
  });
}

@Injectable()
export class LearningDatabase implements OnApplicationShutdown {
  private connection?: Promise<DataSource>;

  async run<T>(operation: (database: DataSource) => Promise<T>): Promise<T> {
    try {
      this.connection ??= createLearningDataSource(process.env.DATABASE_URL)
        .initialize()
        .catch((error: unknown) => {
          this.connection = undefined;
          throw error;
        });
      return await operation(await this.connection);
    } catch {
      throw apiError('SERVICE_UNAVAILABLE', 'Learning database is unavailable');
    }
  }

  async onApplicationShutdown(): Promise<void> {
    const database = await this.connection?.catch(() => undefined);
    if (database?.isInitialized) await database.destroy();
  }
}
