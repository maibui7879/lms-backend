import { Module } from '@nestjs/common';
import { DiscussionsController } from './discussions.controller';
import { DiscussionsService } from './discussions.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Discussion } from './discussion.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Discussion])],
  controllers: [DiscussionsController],
  providers: [DiscussionsService],
  exports: [DiscussionsService],
})
export class DiscussionsModule {}
