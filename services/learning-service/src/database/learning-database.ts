import { HttpException, Injectable } from '@nestjs/common';
import type { OnApplicationShutdown } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { EntityManager } from 'typeorm';
import { apiError } from '../common/api-error';
import { AssessmentAttempt } from '../modules/progress-sync/entities/assessment-attempt.entity';
import { AssessmentSyncReceipt } from '../modules/progress-sync/entities/assessment-sync-receipt.entity';
import { ItemCompletion } from '../modules/progress/entities/item-completion.entity';
import { LearningResume } from '../modules/progress/entities/learning-resume.entity';
import { LessonCompletion } from '../modules/progress/entities/lesson-completion.entity';
import { CreateItemCompletions1794528000000 } from './migrations/1794528000000-create-item-completions';
import { CreateAssessmentAttempts1794528000001 } from './migrations/1794528000001-create-assessment-attempts';
import { CreateAssessmentSyncReceipts1794528000002 } from './migrations/1794528000002-create-assessment-sync-receipts';
import { BindSyncReceiptToAssessmentVersion1794528000003 } from './migrations/1794528000003-bind-sync-receipt-to-assessment-version';
import { CreateLessonCompletions1794528000004 } from './migrations/1794528000004-create-lesson-completions';
import { CreateResumeCheckpoints1794528000005 } from './migrations/1794528000005-create-resume-checkpoints';
import { CourseItemMigration } from '../modules/progress/entities/course-item-migration.entity';
import { AddItemInvalidations1794528000006 } from './migrations/1794528000006-add-item-invalidations';
import { CourseSkill } from '../modules/mastery/entities/course-skill.entity';
import { CreateCourseSkills1794528000007 } from './migrations/1794528000007-create-course-skills';
import { MasteryCurrent } from '../modules/mastery/entities/mastery-current.entity';
import { MasterySnapshot } from '../modules/mastery/entities/mastery-snapshot.entity';
import { SaveMastery1794528000008 } from './migrations/1794528000008-save-mastery';
import { SkillPrerequisites } from '../modules/recommendations/entities/skill-prerequisites.entity';
import { CreateSkillPrerequisites1794528000009 } from './migrations/1794528000009-create-skill-prerequisites';
import { Certificate } from '../modules/certificates/entities/certificate.entity';
import { CertificateIssuanceReceipt } from '../modules/certificates/entities/certificate-issuance-receipt.entity';
import { CreateCertificates1794528000010 } from './migrations/1794528000010-create-certificates';
import { CertificateDocument } from '../modules/certificates/entities/certificate-document.entity';
import { CreateCertificateDocuments1794528000011 } from './migrations/1794528000011-create-certificate-documents';
import { AddCertificateRevocation1794528000012 } from './migrations/1794528000012-add-certificate-revocation';
import { LinkCertificateReplacements1794528000013 } from './migrations/1794528000013-link-certificate-replacements';
import { ScopeProgressToEnrollmentStart1794528000014 } from './migrations/1794528000014-scope-progress-to-enrollment-start';

export function createLearningDataSource(url: string | undefined): DataSource {
  if (!url) throw new Error('DATABASE_URL is required for Learning PostgreSQL');
  return new DataSource({
    type: 'postgres',
    url,
    entities: [
      ItemCompletion,
      LessonCompletion,
      LearningResume,
      AssessmentAttempt,
      AssessmentSyncReceipt,
      CourseItemMigration,
      CourseSkill,
      MasteryCurrent,
      MasterySnapshot,
      SkillPrerequisites,
      Certificate,
      CertificateIssuanceReceipt,
      CertificateDocument,
    ],
    migrations: [
      CreateItemCompletions1794528000000,
      CreateAssessmentAttempts1794528000001,
      CreateAssessmentSyncReceipts1794528000002,
      BindSyncReceiptToAssessmentVersion1794528000003,
      CreateLessonCompletions1794528000004,
      CreateResumeCheckpoints1794528000005,
      AddItemInvalidations1794528000006,
      CreateCourseSkills1794528000007,
      SaveMastery1794528000008,
      CreateSkillPrerequisites1794528000009,
      CreateCertificates1794528000010,
      CreateCertificateDocuments1794528000011,
      AddCertificateRevocation1794528000012,
      LinkCertificateReplacements1794528000013,
      ScopeProgressToEnrollmentStart1794528000014,
    ],
    synchronize: false,
    connectTimeoutMS: 5000,
  });
}

@Injectable()
export class LearningDatabase implements OnApplicationShutdown {
  private connection?: Promise<DataSource>;

  // Take the cutoff from the same clock that timestamps progress writes.
  async readTime(manager?: EntityManager): Promise<number> {
    const read = async (reader: EntityManager) => {
      const [row] = await reader.query<{ now: Date }[]>(
        'SELECT clock_timestamp() AS now',
      );
      return row.now.getTime();
    };
    return manager
      ? read(manager)
      : this.run((database) => read(database.manager));
  }

  async readSnapshot<T>(
    read: (manager: EntityManager, asOf: number) => Promise<T>,
  ): Promise<T> {
    return this.run((database) =>
      database.transaction('REPEATABLE READ', async (manager) => {
        return read(manager, await this.readTime(manager));
      }),
    );
  }

  async run<T>(operation: (database: DataSource) => Promise<T>): Promise<T> {
    try {
      this.connection ??= createLearningDataSource(process.env.DATABASE_URL)
        .initialize()
        .catch((error: unknown) => {
          this.connection = undefined;
          throw error;
        });
      return await operation(await this.connection);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw apiError('SERVICE_UNAVAILABLE', 'Learning database is unavailable');
    }
  }

  async onApplicationShutdown(): Promise<void> {
    const database = await this.connection?.catch(() => undefined);
    if (database?.isInitialized) await database.destroy();
  }
}
