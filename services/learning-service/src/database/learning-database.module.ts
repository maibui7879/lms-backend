import { Module } from '@nestjs/common';
import { LearningDatabase } from './learning-database';

@Module({
  providers: [LearningDatabase],
  exports: [LearningDatabase],
})
export class LearningDatabaseModule {}
