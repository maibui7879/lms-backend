import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('discussions')
export class Discussion {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid') courseId!: string;
  @Column({ type: 'uuid', nullable: true }) lessonId!: string | null;
  @Column({ type: 'uuid', nullable: true }) parentId!: string | null;
  @Column('uuid') authorId!: string;
  @Column('text') body!: string;
  @Column({ type: 'boolean', default: false }) pinned!: boolean;
  @Column({ type: 'integer', default: 1 }) version!: number;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt!: Date;
}
