import { Module } from '@nestjs/common';
import type { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { requestContext } from '../../common/request-context';
import { LearningDatabaseModule } from '../../database/learning-database.module';
import { CourseClient } from '../../integrations/course.client';
import { ProgressModule } from '../progress/progress.module';
import {
  AdminCertificatesController,
  CertificatesController,
  CertificateVerificationController,
} from './certificates.controller';
import { CertificatesService } from './certificates.service';
import { CertificatesRepository } from './repositories/certificates.repository';

@Module({
  imports: [LearningDatabaseModule, ProgressModule],
  controllers: [
    CertificatesController,
    CertificateVerificationController,
    AdminCertificatesController,
  ],
  providers: [CourseClient, CertificatesService, CertificatesRepository],
})
export class CertificatesModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(requestContext)
      .forRoutes(
        CertificatesController,
        CertificateVerificationController,
        AdminCertificatesController,
      );
  }
}
