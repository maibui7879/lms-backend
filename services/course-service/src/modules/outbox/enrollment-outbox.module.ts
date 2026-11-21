import { Module } from '@nestjs/common';
import { EnrollmentOutboxService } from './enrollment-outbox.service';
import { EnrollmentOutboxPublisher } from './enrollment-outbox.publisher';
import { CourseMigrationDispatcher } from './course-migration-dispatch';

@Module({
  providers: [
    EnrollmentOutboxService,
    EnrollmentOutboxPublisher,
    CourseMigrationDispatcher,
  ],
  exports: [EnrollmentOutboxService],
})
export class EnrollmentOutboxModule {}
