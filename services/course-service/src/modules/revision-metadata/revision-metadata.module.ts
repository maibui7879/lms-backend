import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  CoursePatchNotice,
  CoursePatchNoticeRead,
  CourseRevisionChange,
} from './entities';
import { InternalServiceGuard } from '../../common/internal-service.guard';
import { RevisionMetadataController } from './revision-metadata.controller';
import { RevisionMetadataService } from './revision-metadata.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CoursePatchNotice,
      CoursePatchNoticeRead,
      CourseRevisionChange,
    ]),
  ],
  controllers: [RevisionMetadataController],
  providers: [RevisionMetadataService, InternalServiceGuard],
})
export class RevisionMetadataModule {}
