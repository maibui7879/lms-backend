import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ProgressSyncModule } from './modules/progress-sync/progress-sync.module';
import { ProgressModule } from './modules/progress/progress.module';

@Module({
  imports: [ProgressModule, ProgressSyncModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
