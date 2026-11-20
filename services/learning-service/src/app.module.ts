import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ProgressSyncModule } from './modules/progress-sync/progress-sync.module';
import { ProgressModule } from './modules/progress/progress.module';
import { MasteryModule } from './modules/mastery/mastery.module';
import { RecommendationsModule } from './modules/recommendations/recommendations.module';
import { CertificatesModule } from './modules/certificates/certificates.module';
import { InstructorReportsModule } from './modules/instructor-reports/instructor-reports.module';

@Module({
  imports: [
    ProgressModule,
    ProgressSyncModule,
    MasteryModule,
    RecommendationsModule,
    CertificatesModule,
    InstructorReportsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
