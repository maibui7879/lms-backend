import { Module } from '@nestjs/common';
import { LearningItemsController } from './learning-items.controller';
import { LearningItemsService } from './learning-items.service';

@Module({
  controllers: [LearningItemsController],
  providers: [LearningItemsService],
  exports: [LearningItemsService],
})
export class LearningItemsModule {}
