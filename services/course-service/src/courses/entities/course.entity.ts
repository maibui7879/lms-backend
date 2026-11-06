import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { CourseStatus } from '@lms/contracts';

@Entity('courses')
export class Course {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid' }) instructorId!: string;
  @Column({ type: 'varchar', length: 200 }) title!: string;
  @Column({ type: 'text' }) description!: string;
  @Column({ type: 'text', nullable: true }) thumbnailUrl!: string | null;
  @Column({ type: 'varchar', length: 20, default: 'DRAFT' })
  status!: CourseStatus;
  @Column({ type: 'integer', default: 1 }) version!: number;
  @Column({ type: 'integer', default: 1 }) contentVersion!: number;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt!: Date;
}
