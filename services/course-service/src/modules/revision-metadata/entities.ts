import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type {
  CourseRevisionChangeData,
  CoursePatchNoticeData,
} from '@lms/contracts';

@Entity('course_revision_changes')
export class CourseRevisionChange {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid') revisionId!: string;
  @Column('varchar') entityType!: CourseRevisionChangeData['entityType'];
  @Column('uuid') entityId!: string;
  @Column('varchar') changeType!: CourseRevisionChangeData['changeType'];
  @Column({ type: 'integer', nullable: true }) oldVersion!: number | null;
  @Column({ type: 'integer', nullable: true }) newVersion!: number | null;
  @Column('boolean') isCritical!: boolean;
  @Column('text') summary!: string;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date;
}

@Entity('course_patch_notices')
export class CoursePatchNotice {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid') courseId!: string;
  @Column('uuid') revisionId!: string;
  @Column('varchar') severity!: CoursePatchNoticeData['severity'];
  @Column('text') title!: string;
  @Column('text') message!: string;
  @Column('boolean') requiresAction!: boolean;
  @Column('timestamptz') publishedAt!: Date;
}

@Entity('course_patch_notice_reads')
export class CoursePatchNoticeRead {
  @PrimaryColumn('uuid') noticeId!: string;
  @PrimaryColumn('uuid') userId!: string;
  @CreateDateColumn({ type: 'timestamptz' }) readAt!: Date;
}
